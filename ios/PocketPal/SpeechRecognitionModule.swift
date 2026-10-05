import Foundation
import React
import Speech
import AVFoundation

@objc(SpeechRecognitionModule)
class SpeechRecognitionModule: NSObject, RCTBridgeModule {
    // A fresh engine per session. A long-lived engine keeps the input node's
    // format from whatever session category was active when it was created
    // (often playback with no input: 0 Hz / 0 channels); installTap with that
    // format fails AVAudioEngine's internal check and aborts the whole app
    // (`_AVAE_Check` -> SIGABRT), which Swift cannot catch.
    private var audioEngine: AVAudioEngine?
    private var tapInstalled = false
    private var sessionObservers: [NSObjectProtocol] = []
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var silenceWorkItem: DispatchWorkItem?
    private var hardTimeoutWorkItem: DispatchWorkItem?
    private var resolveBlock: RCTPromiseResolveBlock?
    private var rejectBlock: RCTPromiseRejectBlock?
    private var latestTranscript = ""
    private var settled = false

    @objc
    static func moduleName() -> String! {
        return "SpeechRecognitionModule"
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return true
    }

    @objc
    func recognizeOnce(
        _ locale: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            self.cancelInternal(rejectPending: false)
            self.resolveBlock = resolve
            self.rejectBlock = reject
            self.latestTranscript = ""
            self.settled = false

            SFSpeechRecognizer.requestAuthorization { status in
                DispatchQueue.main.async {
                    guard status == .authorized else {
                        self.rejectAndCleanup(
                            code: "speech_permission_denied",
                            message: "Speech recognition permission was not granted."
                        )
                        return
                    }

                    AVAudioSession.sharedInstance().requestRecordPermission { granted in
                        DispatchQueue.main.async {
                            guard granted else {
                                self.rejectAndCleanup(
                                    code: "microphone_permission_denied",
                                    message: "Microphone permission was not granted."
                                )
                                return
                            }
                            self.startRecognition(locale: locale)
                        }
                    }
                }
            }
        }
    }

    @objc
    func cancel() {
        DispatchQueue.main.async {
            self.cancelInternal(rejectPending: true)
        }
    }

    private func startRecognition(locale: String) {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)),
              recognizer.isAvailable else {
            rejectAndCleanup(
                code: "speech_unavailable",
                message: "Speech recognition is not available for this language right now."
            )
            return
        }

        let session = AVAudioSession.sharedInstance()
        do {
            // playAndRecord keeps TTS/playback working right after dictation and
            // accepts headset/Bluetooth microphones.
            try session.setCategory(
                .playAndRecord,
                mode: .measurement,
                options: [.duckOthers, .defaultToSpeaker, .allowBluetooth]
            )
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            rejectAndCleanup(
                code: "audio_session_failed",
                message: "The microphone could not be prepared: \(error.localizedDescription)"
            )
            return
        }

        guard session.isInputAvailable else {
            rejectAndCleanup(
                code: "audio_input_unavailable",
                message: "No microphone is available right now."
            )
            return
        }

        // Created only after the session is active, so the input node reports
        // the real hardware format of the current route.
        let engine = AVAudioEngine()
        audioEngine = engine
        let inputNode = engine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            rejectAndCleanup(
                code: "audio_input_unavailable",
                message: "The microphone is not ready yet. Please try again."
            )
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        recognitionRequest = request

        inputNode.installTap(
            onBus: 0,
            bufferSize: 1024,
            format: format
        ) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }
        tapInstalled = true
        observeSessionChanges(engine: engine)

        do {
            engine.prepare()
            try engine.start()
        } catch {
            rejectAndCleanup(
                code: "speech_start_failed",
                message: error.localizedDescription
            )
            return
        }

        recognitionTask = recognizer.recognitionTask(with: request) {
            [weak self] result, error in
            guard let self = self else { return }
            DispatchQueue.main.async {
                if let result = result {
                    let transcript = result.bestTranscription.formattedString
                    if !transcript.isEmpty {
                        self.latestTranscript = transcript
                        self.scheduleSilenceFinish()
                    }
                    if result.isFinal {
                        self.resolveAndCleanup(transcript)
                        return
                    }
                }

                if let error = error, !self.settled {
                    if !self.latestTranscript.isEmpty {
                        self.resolveAndCleanup(self.latestTranscript)
                    } else {
                        self.rejectAndCleanup(
                            code: "speech_recognition_failed",
                            message: error.localizedDescription
                        )
                    }
                }
            }
        }

        scheduleHardTimeout()
    }

    /// Route / engine configuration changes and interruptions end the session
    /// gracefully (keeping any transcript) instead of leaving a stale engine.
    private func observeSessionChanges(engine: AVAudioEngine) {
        removeSessionObservers()
        let center = NotificationCenter.default
        let finish: (Notification) -> Void = { [weak self] _ in
            DispatchQueue.main.async {
                guard let self = self, !self.settled else { return }
                if !self.latestTranscript.isEmpty {
                    self.resolveAndCleanup(self.latestTranscript)
                } else {
                    self.rejectAndCleanup(
                        code: "audio_route_changed",
                        message: "The audio input changed. Please try again."
                    )
                }
            }
        }
        sessionObservers = [
            center.addObserver(
                forName: .AVAudioEngineConfigurationChange,
                object: engine,
                queue: nil,
                using: finish
            ),
            center.addObserver(
                forName: AVAudioSession.interruptionNotification,
                object: nil,
                queue: nil,
                using: finish
            ),
            center.addObserver(
                forName: AVAudioSession.mediaServicesWereResetNotification,
                object: nil,
                queue: nil,
                using: finish
            ),
        ]
    }

    private func removeSessionObservers() {
        for observer in sessionObservers {
            NotificationCenter.default.removeObserver(observer)
        }
        sessionObservers = []
    }

    private func scheduleSilenceFinish() {
        silenceWorkItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self = self, !self.settled else { return }
            self.recognitionRequest?.endAudio()
        }
        silenceWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.25, execute: item)
    }

    private func scheduleHardTimeout() {
        hardTimeoutWorkItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self = self, !self.settled else { return }
            self.recognitionRequest?.endAudio()
        }
        hardTimeoutWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 20.0, execute: item)
    }

    private func resolveAndCleanup(_ transcript: String) {
        guard !settled else { return }
        settled = true
        let resolve = resolveBlock
        cleanup()
        resolve?(transcript.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func rejectAndCleanup(code: String, message: String) {
        guard !settled else { return }
        settled = true
        let reject = rejectBlock
        cleanup()
        reject?(code, message, nil)
    }

    private func cancelInternal(rejectPending: Bool) {
        guard recognitionTask != nil || resolveBlock != nil || rejectBlock != nil else {
            cleanup()
            return
        }

        if rejectPending && !settled {
            settled = true
            let reject = rejectBlock
            cleanup()
            reject?("speech_cancelled", "Speech recognition was cancelled.", nil)
        } else {
            cleanup()
        }
    }

    private func cleanup() {
        silenceWorkItem?.cancel()
        hardTimeoutWorkItem?.cancel()
        silenceWorkItem = nil
        hardTimeoutWorkItem = nil

        removeSessionObservers()
        // Idempotent: the tap is removed only if this session installed it, and
        // the engine is dropped so the next session starts clean.
        if let engine = audioEngine {
            if engine.isRunning {
                engine.stop()
            }
            if tapInstalled {
                engine.inputNode.removeTap(onBus: 0)
            }
        }
        tapInstalled = false
        audioEngine = nil

        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil

        try? AVAudioSession.sharedInstance().setActive(
            false,
            options: .notifyOthersOnDeactivation
        )

        resolveBlock = nil
        rejectBlock = nil
        latestTranscript = ""
    }
}
