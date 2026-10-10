package io.github.l2hyunwoo.nitro.webview

internal object NitroWebViewMessagePolicy {
  fun configurationError(
    origins: Array<String>?,
    supportsSenderIdentity: Boolean,
  ): String? =
    when {
      origins == null -> {
        null
      }

      !supportsSenderIdentity -> {
        "allowedMessageOrigins requires WEB_MESSAGE_LISTENER support."
      }

      origins.any {
        NitroWebViewPermissions.canonicalOrigin(it) == null || java.net.URI(it).port == 0
      } -> {
        "allowedMessageOrigins accepts only exact HTTP(S) origins."
      }

      else -> {
        null
      }
    }

  fun allows(
    origins: Array<String>?,
    sourceOrigin: String?,
    supportsSenderIdentity: Boolean,
  ): Boolean {
    if (configurationError(origins, supportsSenderIdentity) != null) return false
    if (origins == null) return true
    return sourceOrigin != null && NitroWebViewPermissions.allows(origins, sourceOrigin)
  }
}
