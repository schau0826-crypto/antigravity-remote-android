# Keep GeckoView native & JNI classes and WebExtension delegates intact
-keep class org.mozilla.gecko.** { *; }
-keep class org.mozilla.geckoview.** { *; }
-dontwarn org.mozilla.gecko.**
-dontwarn org.mozilla.geckoview.**

# Keep app ExtensionBridge & delegates invoked across JNI / Reflection
-keep class com.agremote.android.ExtensionBridge { *; }
-keep class com.agremote.android.ExtensionBridge$* { *; }
-keep class com.agremote.android.AntigravityApp { *; }
-keep class com.agremote.android.MainActivity { *; }
-keep class com.agremote.android.MainActivity$* { *; }

-keepclassmembers class * implements org.mozilla.geckoview.WebExtension$MessageDelegate { *; }
-keepclassmembers class * implements org.mozilla.geckoview.WebExtension$PortDelegate { *; }
-keepclassmembers class * implements org.mozilla.geckoview.WebExtension$SessionTabDelegate { *; }
-keepclassmembers class * implements org.mozilla.geckoview.WebExtension$TabDelegate { *; }
