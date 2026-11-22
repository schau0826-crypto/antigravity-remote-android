package com.agremote.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlPolicyTest {
    @Test
    fun `allows antigravity and google auth hosts inside app`() {
        val allowedUrls = listOf(
            "https://antigravity.google.com/",
            "https://antigravity.google.com/remote?session=123",
            "https://antigravity.google/",
            "https://remote.antigravity.google/",
            "https://google.com/",
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc",
            "https://accounts.google.com.hk/accounts/SetSID?continue=https://antigravity.google.com/",
            "https://accounts.google.co.jp/ServiceLogin",
            "https://accounts.google.com.tw/ServiceLogin",
            "https://accounts.youtube.com/accounts/SetSID",
            "https://myaccount.google.com/security",
            "https://gds.google.com/web/landing",
            "https://ogs.google.com/u/0/widget/account",
            "https://fonts.gstatic.com/s/inter/v12/font.woff2",
            "https://lh3.googleusercontent.com/a/avatar",
            "https://consent.google.com/m?continue=https://antigravity.google.com",
            "https://antigravity.static.usercontent.goog/web/2.34.0/?iframe=true"
        )

        for (url in allowedUrls) {
            assertEquals("Expected IN_APP for $url", UrlAction.IN_APP, UrlPolicy.classify(url))
        }
    }

    @Test
    fun `allows host matching case-insensitively and with port or trailing dot`() {
        assertEquals(UrlAction.IN_APP, UrlPolicy.classify("HTTPS://ANTIGRAVITY.GOOGLE.COM:443/chat"))
        assertEquals(UrlAction.IN_APP, UrlPolicy.classify("https://accounts.google.com./ServiceLogin"))
    }

    @Test
    fun `routes third-party and spoofed external http urls to external browser`() {
        val externalUrls = listOf(
            "https://github.com/google/antigravity",
            "https://example.com/docs",
            "http://localhost:8080/preview",
            "https://evilgoogle.com/phish",
            "https://google.com.evil.org/login",
            "https://accounts.google.com.attacker.net/",
            "https://gstatic.com.fake.io/a.js"
        )

        for (url in externalUrls) {
            assertEquals("Expected EXTERNAL_BROWSER for $url", UrlAction.EXTERNAL_BROWSER, UrlPolicy.classify(url))
        }
    }

    @Test
    fun `handles internal browser schemes and external action intents safely`() {
        assertEquals(UrlAction.IN_APP, UrlPolicy.classify("about:blank"))
        assertEquals(UrlAction.IN_APP, UrlPolicy.classify("blob:https://antigravity.google.com/123"))
        assertEquals(UrlAction.IN_APP, UrlPolicy.classify("data:text/plain;base64,SGVsbG8="))

        assertEquals(UrlAction.EXTERNAL_INTENT, UrlPolicy.classify("mailto:support@example.com"))
        assertEquals(UrlAction.EXTERNAL_INTENT, UrlPolicy.classify("tel:+1234567890"))
        assertEquals(UrlAction.EXTERNAL_INTENT, UrlPolicy.classify("intent://scan/#Intent;scheme=zxing;end"))

        assertEquals(UrlAction.IGNORE, UrlPolicy.classify(null))
        assertEquals(UrlAction.IGNORE, UrlPolicy.classify("   "))
        assertEquals(UrlAction.IGNORE, UrlPolicy.classify("file:///etc/passwd"))
    }

    @Test
    fun `normalizes home url cleanly`() {
        assertEquals(UrlPolicy.DEFAULT_HOME_URL, UrlPolicy.normalizeHomeUrl(null))
        assertEquals(UrlPolicy.DEFAULT_HOME_URL, UrlPolicy.normalizeHomeUrl("   "))
        assertEquals("https://antigravity.google.com/projects", UrlPolicy.normalizeHomeUrl("antigravity.google.com/projects"))
        assertEquals("https://localhost:3000/test", UrlPolicy.normalizeHomeUrl("localhost:3000/test"))
        assertEquals("http://192.168.1.10:3000", UrlPolicy.normalizeHomeUrl("http://192.168.1.10:3000"))
        assertEquals(UrlPolicy.DEFAULT_HOME_URL, UrlPolicy.normalizeHomeUrl("javascript:alert(1)"))
    }

    @Test
    fun `only opens external browser on explicit user tap outside auth flows`() {
        val externalUrl = "https://github.com/google/antigravity"
        assertTrue(
            UrlPolicy.shouldOpenExternally(
                url = externalUrl,
                isRedirect = false,
                hasUserGesture = true,
                isDirectNavigation = false,
                isPopup = false
            )
        )
        assertFalse(
            UrlPolicy.shouldOpenExternally(
                url = externalUrl,
                isRedirect = true,
                hasUserGesture = true,
                isDirectNavigation = false,
                isPopup = false
            )
        )
        assertFalse(
            UrlPolicy.shouldOpenExternally(
                url = externalUrl,
                isRedirect = false,
                hasUserGesture = false,
                isDirectNavigation = false,
                isPopup = false
            )
        )
        assertFalse(
            UrlPolicy.shouldOpenExternally(
                url = externalUrl,
                isRedirect = false,
                hasUserGesture = true,
                isDirectNavigation = true,
                isPopup = false
            )
        )
        assertFalse(
            UrlPolicy.shouldOpenExternally(
                url = externalUrl,
                isRedirect = false,
                hasUserGesture = true,
                isDirectNavigation = false,
                isPopup = true
            )
        )
    }

    @Test
    fun `detects rememberable remote session urls accurately`() {
        assertTrue(UrlPolicy.isRememberableRemoteUrl("https://antigravity.google.com/r/00000000-0000-0000-0000-000000000000-v2"))
        assertTrue(UrlPolicy.isRememberableRemoteUrl("https://antigravity.google/r/example-machine"))
        assertFalse(UrlPolicy.isRememberableRemoteUrl("https://antigravity.google.com/"))
        assertFalse(UrlPolicy.isRememberableRemoteUrl("https://antigravity.google.com/r/"))
        assertFalse(UrlPolicy.isRememberableRemoteUrl("https://accounts.google.com/ServiceLogin"))
        assertFalse(UrlPolicy.isRememberableRemoteUrl("https://antigravity.static.usercontent.goog/web/2.34.0/"))
    }

    @Test
    fun `matches cross-worker extension contract constants`() {
        assertEquals("resource://android/assets/i18n_zh_ext/", ExtensionBridge.EXTENSION_URI)
        assertEquals("ag-remote-zh@agremote.local", ExtensionBridge.EXTENSION_ID)
        assertEquals("ag_remote_i18n", ExtensionBridge.NATIVE_APP_NAME)
    }

    @Test
    fun `builds fallback remote conversation urls safely`() {
        val baseUrl = "https://antigravity.google.com/r/sample-machine-v2?p=c%2Fold-cid%3Fproject%3Dold-proj"
        assertEquals(
            "https://antigravity.google.com/r/sample-machine-v2?p=c%2Fnew-cid-123%3Fproject%3Dproj-alpha",
            UrlPolicy.buildRemoteConversationUrl(baseUrl, "new-cid-123", "proj-alpha")
        )
        assertEquals(
            "https://antigravity.google.com/r/sample-machine-v2?p=c%2Fnew-cid-123",
            UrlPolicy.buildRemoteConversationUrl("https://antigravity.google.com/r/sample-machine-v2", "new-cid-123", null)
        )
        assertNull(UrlPolicy.buildRemoteConversationUrl("https://antigravity.google.com/", "new-cid-123", "proj-alpha"))
        assertNull(UrlPolicy.buildRemoteConversationUrl(baseUrl, "bad/id?", "proj-alpha"))
    }
}
