plugins { kotlin("jvm") version "2.2.10" }

repositories { mavenCentral() }

kotlin {
    jvmToolchain(17)
    compilerOptions {
        languageVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_1_9)
        apiVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_1_9)
    }
    sourceSets {
        named("main") {
            kotlin.srcDir("../../app/src/main/java")
            kotlin.include("com/betbrawl/app/server/BrawlWebSocketServer.kt", "com/betbrawl/app/server/engine/**",
                "com/betbrawl/app/server/model/**", "com/betbrawl/app/server/LanDiscovery.kt",
                "com/betbrawl/app/webview/DeepLinkParser.kt")
        }
        named("test") {
            kotlin.srcDir("../../app/src/test/java")
            resources.srcDir("../../src/engine/fixtures")
        }
    }
}

// Use an installed platform only as API stubs; this task never installs or runs Android.
val sdk = System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT")
    ?: "${System.getProperty("user.home")}/AppData/Local/Android/Sdk"
val androidJar = file("$sdk/platforms").listFiles()?.sortedBy { it.name }
    ?.map { it.resolve("android.jar") }?.lastOrNull { it.isFile }
    ?: error("Set ANDROID_HOME to an existing SDK containing a platform android.jar")

dependencies {
    implementation("org.java-websocket:Java-WebSocket:1.5.7")
    implementation("com.google.code.gson:gson:2.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
    implementation("org.json:json:20240303")
    compileOnly(files(androidJar))
    testRuntimeOnly(files(androidJar))
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}

tasks.test { testLogging { events("failed", "skipped"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL } }
