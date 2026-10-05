package com.pocketpal

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeSpeechRecognitionSpec

@ReactModule(name = NativeSpeechRecognitionSpec.NAME)
class SpeechRecognitionModule(reactContext: ReactApplicationContext) :
    NativeSpeechRecognitionSpec(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var pendingPromise: Promise? = null
  private var hardTimeout: Runnable? = null

  override fun getName(): String = NativeSpeechRecognitionSpec.NAME

  override fun recognizeOnce(locale: String, promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("speech_in_flight", "Speech recognition is already running.")
      return
    }

    if (
        ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.RECORD_AUDIO
        ) != PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject(
          "microphone_permission_denied",
          "Microphone permission was not granted."
      )
      return
    }

    mainHandler.post {
      if (!SpeechRecognizer.isRecognitionAvailable(reactApplicationContext)) {
        promise.reject(
            "speech_unavailable",
            "Speech recognition is not available on this device."
        )
        return@post
      }

      pendingPromise = promise

      val speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactApplicationContext)
      recognizer = speechRecognizer

      speechRecognizer.setRecognitionListener(
          object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}

            override fun onError(error: Int) {
              if (pendingPromise == null) return
              val code =
                  when (error) {
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                        "microphone_permission_denied"
                    SpeechRecognizer.ERROR_NO_MATCH -> "speech_no_match"
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "speech_timeout"
                    SpeechRecognizer.ERROR_NETWORK,
                    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "speech_network_error"
                    else -> "speech_recognition_failed"
                  }
              rejectPending(code, "Speech recognition failed (code $error).")
            }

            override fun onResults(results: Bundle?) {
              val matches =
                  results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
              val transcript = matches?.firstOrNull()?.trim().orEmpty()
              if (transcript.isBlank()) {
                rejectPending("speech_no_match", "No speech was recognized.")
              } else {
                resolvePending(transcript)
              }
            }

            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
          }
      )

      val intent =
          Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
          }

      try {
        speechRecognizer.startListening(intent)
        val timeout =
            Runnable {
              if (pendingPromise != null) {
                try {
                  recognizer?.stopListening()
                } catch (_: Exception) {}
              }
            }
        hardTimeout = timeout
        mainHandler.postDelayed(timeout, 20_000)
      } catch (e: Exception) {
        rejectPending("speech_start_failed", e.message ?: "Unable to start speech recognition.", e)
      }
    }
  }

  override fun cancel() {
    mainHandler.post {
      if (pendingPromise != null) {
        rejectPending("speech_cancelled", "Speech recognition was cancelled.")
      } else {
        cleanup()
      }
    }
  }

  override fun invalidate() {
    mainHandler.post {
      if (pendingPromise != null) {
        rejectPending("speech_cancelled", "Speech recognition was cancelled.")
      } else {
        cleanup()
      }
    }
    super.invalidate()
  }

  private fun resolvePending(transcript: String) {
    val promise = pendingPromise ?: return
    pendingPromise = null
    cleanup()
    promise.resolve(transcript)
  }

  private fun rejectPending(
      code: String,
      message: String,
      throwable: Throwable? = null
  ) {
    val promise = pendingPromise ?: return
    pendingPromise = null
    cleanup()
    promise.reject(code, message, throwable)
  }

  private fun cleanup() {
    hardTimeout?.let { mainHandler.removeCallbacks(it) }
    hardTimeout = null
    try {
      recognizer?.cancel()
    } catch (_: Exception) {}
    try {
      recognizer?.destroy()
    } catch (_: Exception) {}
    recognizer = null
  }
}
