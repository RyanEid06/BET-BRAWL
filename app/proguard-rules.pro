# BET & BRAWL Proguard Rules
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class org.java_websocket.** { *; }
-keep class com.betbrawl.app.server.model.** { *; }
