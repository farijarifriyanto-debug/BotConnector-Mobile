import Foundation
import React
import Speech
import AVFoundation

@objc(SpeechRecognitionModule)
class SpeechRecognitionModule: NSObject, RCTBridgeModule {
    private let audioEngine = AVAudioEngine()
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

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.taskHint = .dictation
            recognitionRequest = request

            let inputNode = audioEngine.inputNode
            inputNode.removeTap(onBus: 0)
            let format = inputNode.outputFormat(forBus: 0)
            inputNode.installTap(
                onBus: 0,
                bufferSize: 1024,
                format: format
            ) { [weak self] buffer, _ in
                self?.recognitionRequest?.append(buffer)
            }

            audioEngine.prepare()
            try audioEngine.start()

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
        } catch {
            rejectAndCleanup(
                code: "speech_start_failed",
                message: error.localizedDescription
            )
        }
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

        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.inputNode.removeTap(onBus: 0)

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
