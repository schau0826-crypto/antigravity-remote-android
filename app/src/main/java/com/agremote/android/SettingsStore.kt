package com.agremote.android

import android.content.Context
import android.content.SharedPreferences

data class AppSettings(
    val homeUrl: String = UrlPolicy.DEFAULT_HOME_URL,
    val i18nEnabled: Boolean = true,
    val customDictJson: String = "{}",
    val customDict: Map<String, String> = emptyMap(),
    val desktopMode: Boolean = false,
    val keepScreenOn: Boolean = false,
    val toolbarCollapsed: Boolean = true,
    val rememberLastRemote: Boolean = true,
    val lastRemoteUrl: String? = null,
    val autoReconnectOnResume: Boolean = true,
    val fabOffsetRatio: Float = 0.62f
)

data class CustomDictParseResult(
    val isValid: Boolean,
    val entries: Map<String, String> = emptyMap(),
    val normalizedJson: String = "{}",
    val errorMessage: String? = null
)

object CustomDictJsonParser {
    fun parse(raw: String?): CustomDictParseResult {
        val trimmed = raw?.trim().orEmpty()
        if (trimmed.isEmpty()) {
            return CustomDictParseResult(
                isValid = true,
                entries = emptyMap(),
                normalizedJson = "{}"
            )
        }
        return try {
            val reader = JsonObjectReader(trimmed)
            val entries = reader.parseObject()
            CustomDictParseResult(
                isValid = true,
                entries = entries,
                normalizedJson = serialize(entries)
            )
        } catch (e: JsonParseException) {
            CustomDictParseResult(
                isValid = false,
                errorMessage = e.message ?: "JSON 格式无效"
            )
        }
    }

    fun serialize(entries: Map<String, String>, pretty: Boolean = false): String {
        if (entries.isEmpty()) return "{}"
        val sb = StringBuilder()
        sb.append('{')
        var first = true
        for ((key, value) in entries) {
            if (!first) sb.append(',')
            if (pretty) sb.append("\n  ")
            appendJsonString(sb, key)
            sb.append(if (pretty) ": " else ":")
            appendJsonString(sb, value)
            first = false
        }
        if (pretty) sb.append('\n')
        sb.append('}')
        return sb.toString()
    }

    private fun appendJsonString(sb: StringBuilder, text: String) {
        sb.append('"')
        for (ch in text) {
            when (ch) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\b' -> sb.append("\\b")
                '\u000C' -> sb.append("\\f")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> {
                    if (ch.code < 0x20) {
                        sb.append("\\u%04x".format(ch.code))
                    } else {
                        sb.append(ch)
                    }
                }
            }
        }
        sb.append('"')
    }

    private class JsonParseException(message: String) : Exception(message)

    private class JsonObjectReader(private val input: String) {
        private var pos = 0

        fun parseObject(): Map<String, String> {
            skipWhitespace()
            if (peek() != '{') {
                throw JsonParseException("根节点必须是 JSON 对象，例如 {\"Remote Control\": \"远程控制\"}")
            }
            pos++
            skipWhitespace()
            val result = linkedMapOf<String, String>()
            if (peek() == '}') {
                pos++
                skipWhitespace()
                ensureEnd()
                return result
            }
            while (true) {
                skipWhitespace()
                if (peek() != '"') {
                    throw JsonParseException("第 ${pos + 1} 个字符附近缺少双引号键名")
                }
                val key = parseString()
                if (key.isBlank()) {
                    throw JsonParseException("词典键名不能为空")
                }
                skipWhitespace()
                if (peek() != ':') {
                    throw JsonParseException("词条 \"$key\" 后缺少冒号 ':'")
                }
                pos++
                skipWhitespace()
                if (peek() != '"') {
                    throw JsonParseException("词条 \"$key\" 的值必须是字符串")
                }
                val value = parseString()
                result[key] = value
                skipWhitespace()
                when (peek()) {
                    ',' -> {
                        pos++
                    }
                    '}' -> {
                        pos++
                        skipWhitespace()
                        ensureEnd()
                        return result
                    }
                    null -> throw JsonParseException("JSON 对象未闭合，缺少 '}'")
                    else -> throw JsonParseException("第 ${pos + 1} 个字符附近语法错误，期望 ',' 或 '}'")
                }
            }
        }

        private fun parseString(): String {
            if (peek() != '"') {
                throw JsonParseException("期望 '\"'")
            }
            pos++
            val sb = StringBuilder()
            while (pos < input.length) {
                val ch = input[pos++]
                when (ch) {
                    '"' -> return sb.toString()
                    '\\' -> {
                        if (pos >= input.length) {
                            throw JsonParseException("字符串转义未完成")
                        }
                        val esc = input[pos++]
                        when (esc) {
                            '"' -> sb.append('"')
                            '\\' -> sb.append('\\')
                            '/' -> sb.append('/')
                            'b' -> sb.append('\b')
                            'f' -> sb.append('\u000C')
                            'n' -> sb.append('\n')
                            'r' -> sb.append('\r')
                            't' -> sb.append('\t')
                            'u' -> {
                                if (pos + 4 > input.length) {
                                    throw JsonParseException("Unicode 转义长度不足")
                                }
                                val hex = input.substring(pos, pos + 4)
                                val code = hex.toIntOrNull(16)
                                    ?: throw JsonParseException("无效的 Unicode 转义: \\u$hex")
                                sb.append(code.toChar())
                                pos += 4
                            }
                            else -> throw JsonParseException("不支持的转义字符: \\$esc")
                        }
                    }
                    else -> {
                        if (ch.code < 0x20) {
                            throw JsonParseException("字符串包含未转义的控制字符")
                        }
                        sb.append(ch)
                    }
                }
            }
            throw JsonParseException("字符串缺少闭合引号 '\"'")
        }

        private fun ensureEnd() {
            if (pos < input.length) {
                throw JsonParseException("JSON 末尾存在多余内容")
            }
        }

        private fun skipWhitespace() {
            while (pos < input.length && input[pos].isWhitespace()) {
                pos++
            }
        }

        private fun peek(): Char? = if (pos < input.length) input[pos] else null
    }
}

class SettingsStore(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun load(): AppSettings {
        val homeUrl = UrlPolicy.normalizeHomeUrl(prefs.getString(KEY_HOME_URL, UrlPolicy.DEFAULT_HOME_URL))
        val i18nEnabled = prefs.getBoolean(KEY_I18N_ENABLED, true)
        val rawDict = prefs.getString(KEY_CUSTOM_DICT_JSON, "{}") ?: "{}"
        val parsed = CustomDictJsonParser.parse(rawDict)
        val customDict = if (parsed.isValid) parsed.entries else emptyMap()
        val normalizedDictJson = if (parsed.isValid) {
            CustomDictJsonParser.serialize(customDict, pretty = customDict.isNotEmpty())
        } else {
            "{}"
        }
        val rawLastRemote = prefs.getString(KEY_LAST_REMOTE_URL, null)
        val lastRemoteUrl = rawLastRemote?.takeIf { UrlPolicy.isRememberableRemoteUrl(it) }
        return AppSettings(
            homeUrl = homeUrl,
            i18nEnabled = i18nEnabled,
            customDictJson = normalizedDictJson,
            customDict = customDict,
            desktopMode = prefs.getBoolean(KEY_DESKTOP_MODE, false),
            keepScreenOn = prefs.getBoolean(KEY_KEEP_SCREEN_ON, false),
            toolbarCollapsed = prefs.getBoolean(KEY_TOOLBAR_COLLAPSED, true),
            rememberLastRemote = prefs.getBoolean(KEY_REMEMBER_LAST_REMOTE, true),
            lastRemoteUrl = lastRemoteUrl,
            autoReconnectOnResume = prefs.getBoolean(KEY_AUTO_RECONNECT_ON_RESUME, true),
            fabOffsetRatio = prefs.getFloat(KEY_FAB_OFFSET_RATIO, 0.62f).coerceIn(0.15f, 0.85f)
        )
    }

    fun save(settings: AppSettings): AppSettings {
        val normalizedUrl = UrlPolicy.normalizeHomeUrl(settings.homeUrl)
        val parsed = parseCustomDictJson(settings.customDictJson)
        val dictMap = if (parsed.isValid) parsed.entries else settings.customDict
        val normalizedJson = CustomDictJsonParser.serialize(dictMap, pretty = dictMap.isNotEmpty())
        val validLastRemote = settings.lastRemoteUrl?.takeIf { UrlPolicy.isRememberableRemoteUrl(it) }
        val clampedRatio = settings.fabOffsetRatio.coerceIn(0.15f, 0.85f)
        prefs.edit()
            .putString(KEY_HOME_URL, normalizedUrl)
            .putBoolean(KEY_I18N_ENABLED, settings.i18nEnabled)
            .putString(KEY_CUSTOM_DICT_JSON, normalizedJson)
            .putBoolean(KEY_DESKTOP_MODE, settings.desktopMode)
            .putBoolean(KEY_KEEP_SCREEN_ON, settings.keepScreenOn)
            .putBoolean(KEY_TOOLBAR_COLLAPSED, settings.toolbarCollapsed)
            .putBoolean(KEY_REMEMBER_LAST_REMOTE, settings.rememberLastRemote)
            .putString(KEY_LAST_REMOTE_URL, validLastRemote)
            .putBoolean(KEY_AUTO_RECONNECT_ON_RESUME, settings.autoReconnectOnResume)
            .putFloat(KEY_FAB_OFFSET_RATIO, clampedRatio)
            .apply()
        return settings.copy(
            homeUrl = normalizedUrl,
            customDictJson = normalizedJson,
            customDict = dictMap,
            lastRemoteUrl = validLastRemote,
            fabOffsetRatio = clampedRatio
        )
    }

    fun setI18nEnabled(enabled: Boolean): AppSettings {
        prefs.edit().putBoolean(KEY_I18N_ENABLED, enabled).apply()
        return load()
    }

    fun setDesktopMode(desktopMode: Boolean): AppSettings {
        prefs.edit().putBoolean(KEY_DESKTOP_MODE, desktopMode).apply()
        return load()
    }

    fun saveLastRemoteUrl(url: String?) {
        if (UrlPolicy.isRememberableRemoteUrl(url)) {
            prefs.edit().putString(KEY_LAST_REMOTE_URL, url?.trim()).apply()
        }
    }

    fun saveFabOffsetRatio(ratio: Float) {
        prefs.edit().putFloat(KEY_FAB_OFFSET_RATIO, ratio.coerceIn(0.15f, 0.85f)).apply()
    }

    fun setToolbarCollapsed(collapsed: Boolean) {
        prefs.edit().putBoolean(KEY_TOOLBAR_COLLAPSED, collapsed).apply()
    }

    companion object {
        private const val PREFS_NAME = "ag_remote_settings"
        private const val KEY_HOME_URL = "home_url"
        private const val KEY_I18N_ENABLED = "i18n_enabled"
        private const val KEY_CUSTOM_DICT_JSON = "custom_dict_json"
        private const val KEY_DESKTOP_MODE = "desktop_mode"
        private const val KEY_KEEP_SCREEN_ON = "keep_screen_on"
        private const val KEY_TOOLBAR_COLLAPSED = "toolbar_collapsed"
        private const val KEY_REMEMBER_LAST_REMOTE = "remember_last_remote"
        private const val KEY_LAST_REMOTE_URL = "last_remote_url"
        private const val KEY_AUTO_RECONNECT_ON_RESUME = "auto_reconnect_on_resume"
        private const val KEY_FAB_OFFSET_RATIO = "fab_offset_ratio"

        fun parseCustomDictJson(raw: String?): CustomDictParseResult =
            CustomDictJsonParser.parse(raw)

        fun resolveStartupUrl(settings: AppSettings): String {
            val saved = settings.lastRemoteUrl
            return if (settings.rememberLastRemote && UrlPolicy.isRememberableRemoteUrl(saved)) {
                saved!!
            } else {
                settings.homeUrl
            }
        }
    }
}
