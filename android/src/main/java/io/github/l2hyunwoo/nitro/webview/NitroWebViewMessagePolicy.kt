package io.github.l2hyunwoo.nitro.webview

internal object NitroWebViewMessagePolicy {
  class Compiled internal constructor(
    private val origins: Set<String>?,
    val error: String?,
  ) {
    fun allows(sourceOrigin: String?): Boolean {
      if (error != null) return false
      if (origins == null) return true
      val target = sourceOrigin?.let(NitroWebViewPermissions::canonicalOrigin) ?: return false
      return target in origins
    }
  }

  fun compile(
    origins: Array<String>?,
    supportsSenderIdentity: Boolean,
  ): Compiled {
    if (origins == null) return Compiled(null, null)
    if (!supportsSenderIdentity) return Compiled(emptySet(), "allowedMessageOrigins requires WEB_MESSAGE_LISTENER support.")
    val canonical =
      origins.mapNotNull { origin ->
        NitroWebViewPermissions.canonicalOrigin(origin)?.takeIf { java.net.URI(origin).port != 0 }
      }
    val error = if (canonical.size == origins.size) null else "allowedMessageOrigins accepts only exact HTTP(S) origins."
    return Compiled(canonical.toSet(), error)
  }

  fun configurationError(
    origins: Array<String>?,
    supportsSenderIdentity: Boolean,
  ): String? = compile(origins, supportsSenderIdentity).error

  fun allows(
    origins: Array<String>?,
    sourceOrigin: String?,
    supportsSenderIdentity: Boolean,
  ): Boolean = compile(origins, supportsSenderIdentity).allows(sourceOrigin)
}
