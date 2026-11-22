package com.agremote.android

import java.net.URI
import java.util.Locale

enum class UrlAction {
    IN_APP,
    EXTERNAL_BROWSER,
    EXTERNAL_INTENT,
    IGNORE
}

object UrlPolicy {
    const val DEFAULT_HOME_URL = "https://antigravity.google.com/"

    val ALLOWED_EXACT_HOSTS: Set<String> = setOf(
        "antigravity.google.com",
        "antigravity.google",
        "google.com",
        "accounts.google.com",
        "accounts.youtube.com",
        "youtube.com",
        "myaccount.google.com",
        "gds.google.com",
        "ogs.google.com",
        "gstatic.com",
        "googleusercontent.com",
        "googleapis.com",
        "withgoogle.com",
        "google.dev",
        "usercontent.goog"
    )

    val ALLOWED_WILDCARD_SUFFIXES: Set<String> = setOf(
        ".google.com",
        ".antigravity.google",
        ".youtube.com",
        ".gstatic.com",
        ".googleusercontent.com",
        ".googleapis.com",
        ".withgoogle.com",
        ".google.dev",
        ".usercontent.goog"
    )

    // Matches regional Google ccTLDs used during SSO/SetSID redirects (e.g. accounts.google.com.hk, google.co.jp).
    private val GOOGLE_CCTLD_HOST_REGEX =
        Regex("^(?:[a-z0-9-]+\\.)*google\\.(?:[a-z]{2,3}|com\\.[a-z]{2}|co\\.[a-z]{2})$")

    private val INTERNAL_SCHEMES = setOf("about", "blob", "data", "resource", "moz-extension")
    private val EXTERNAL_ACTION_SCHEMES = setOf("mailto", "tel", "sms", "geo", "market", "intent")

    fun classify(rawUrl: String?): UrlAction {
        val url = rawUrl?.trim().orEmpty()
        if (url.isEmpty()) return UrlAction.IGNORE

        val scheme = extractScheme(url) ?: return UrlAction.IGNORE
        if (scheme in INTERNAL_SCHEMES) {
            return UrlAction.IN_APP
        }
        if (scheme in EXTERNAL_ACTION_SCHEMES) {
            return UrlAction.EXTERNAL_INTENT
        }
        if (scheme == "http" || scheme == "https") {
            val host = extractHost(url) ?: return UrlAction.IGNORE
            return if (isAllowedHost(host)) {
                UrlAction.IN_APP
            } else {
                UrlAction.EXTERNAL_BROWSER
            }
        }
        return UrlAction.IGNORE
    }

    fun shouldOpenExternally(
        url: String?,
        isRedirect: Boolean,
        hasUserGesture: Boolean,
        isDirectNavigation: Boolean,
        isPopup: Boolean
    ): Boolean {
        if (classify(url) != UrlAction.EXTERNAL_BROWSER) return false
        return hasUserGesture && !isRedirect && !isDirectNavigation && !isPopup
    }

    fun isRememberableRemoteUrl(rawUrl: String?): Boolean {
        val url = rawUrl?.trim().orEmpty()
        if (url.isEmpty()) return false
        val scheme = extractScheme(url) ?: return false
        if (scheme != "https" && scheme != "http") return false
        val host = extractHost(url) ?: return false
        if (host != "antigravity.google.com" && host != "antigravity.google") {
            return false
        }
        val path = try {
            URI(url).path.orEmpty()
        } catch (_: Exception) {
            ""
        }
        return path.startsWith("/r/") && path.length > 3
    }

    fun isAllowedHost(rawHost: String?): Boolean {
        val host = rawHost
            ?.trim()
            ?.trimEnd('.')
            ?.lowercase(Locale.ROOT)
            .orEmpty()
        if (host.isEmpty()) return false
        if (host in ALLOWED_EXACT_HOSTS) return true
        if (ALLOWED_WILDCARD_SUFFIXES.any { suffix ->
                host.length > suffix.length && host.endsWith(suffix)
            }) {
            return true
        }
        return GOOGLE_CCTLD_HOST_REGEX.matches(host)
    }

    fun normalizeHomeUrl(rawUrl: String?): String {
        val trimmed = rawUrl?.trim().orEmpty()
        if (trimmed.isEmpty()) return DEFAULT_HOME_URL

        val existingScheme = extractScheme(trimmed)
        val hasSchemeSeparator = trimmed.contains("://")
        val withScheme = when {
            hasSchemeSeparator -> trimmed
            existingScheme != null -> {
                // Distinguish host:port (e.g. localhost:3000) from schemes like javascript:alert(1)
                val afterColon = trimmed.substring(existingScheme.length + 1)
                val isPort = afterColon.isNotEmpty() && afterColon[0].isDigit()
                if (isPort) "https://$trimmed" else return DEFAULT_HOME_URL
            }
            else -> "https://$trimmed"
        }

        val scheme = extractScheme(withScheme)
        if (scheme != "http" && scheme != "https") {
            return DEFAULT_HOME_URL
        }
        val host = extractHost(withScheme)
        return if (host.isNullOrBlank()) DEFAULT_HOME_URL else withScheme
    }

    internal fun extractScheme(url: String): String? {
        val colonIndex = url.indexOf(':')
        if (colonIndex <= 0) return null
        val candidate = url.substring(0, colonIndex).lowercase(Locale.ROOT)
        return if (candidate.all { it.isLetterOrDigit() || it == '+' || it == '-' || it == '.' }) {
            candidate
        } else {
            null
        }
    }

    internal fun extractHost(url: String): String? {
        val parsedHost = try {
            URI(url).host
        } catch (_: Exception) {
            null
        }
        if (!parsedHost.isNullOrBlank()) {
            return parsedHost.trimEnd('.').lowercase(Locale.ROOT)
        }
        // Fallback for URLs containing unescaped query characters that cause java.net.URI to reject.
        val schemeEnd = url.indexOf("://")
        if (schemeEnd < 0) return null
        val afterScheme = url.substring(schemeEnd + 3)
        val authorityEnd = afterScheme.indexOfFirst { it == '/' || it == '?' || it == '#' }
            .let { if (it < 0) afterScheme.length else it }
        val authority = afterScheme.substring(0, authorityEnd)
        if (authority.isEmpty()) return null
        val hostPart = authority.substringAfterLast('@')
        val host = if (hostPart.startsWith('[')) {
            hostPart.substringBefore(']').removePrefix("[")
        } else {
            hostPart.substringBefore(':')
        }
        return host.trimEnd('.').lowercase(Locale.ROOT).takeIf { it.isNotEmpty() }
    }
}
