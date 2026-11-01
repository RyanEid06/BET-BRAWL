plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val releaseStore = System.getenv("ANDROID_KEYSTORE_FILE")
val releaseStorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
val releaseAlias = System.getenv("ANDROID_KEY_ALIAS")
val releaseKeyPassword = System.getenv("ANDROID_KEY_PASSWORD")
val releaseSigningReady = listOf(releaseStore, releaseStorePassword, releaseAlias, releaseKeyPassword).all { !it.isNullOrBlank() }

android {
    namespace = "com.betbrawl.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.betbrawl.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 3
        versionName = "2.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (releaseSigningReady) create("production") {
            storeFile = file(releaseStore!!)
            storeType = "PKCS12"
            storePassword = releaseStorePassword
            keyAlias = releaseAlias
            keyPassword = releaseKeyPassword
        }
    }

    buildTypes {
        release {
            if (releaseSigningReady) signingConfig = signingConfigs.getByName("production")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            applicationIdSuffix = ""
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = false
        buildConfig = true
    }

    sourceSets.getByName("test").resources.srcDir("../src/engine/fixtures")

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

val requireProductionSigning by tasks.registering {
    doLast {
        check(releaseSigningReady && file(releaseStore!!).isFile) {
            "Release signing is required. Configure the permanent ANDROID_KEYSTORE_FILE/PASSWORD and ANDROID_KEY_ALIAS/PASSWORD; unsigned releases are not distributable."
        }
    }
}
tasks.matching { it.name == "assembleRelease" || it.name == "packageRelease" }.configureEach {
    dependsOn(requireProductionSigning)
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")

    // Pure Kotlin/Java Authoritative WebSocket Server and Client (Zero external runtime needed)
    implementation("org.java-websocket:Java-WebSocket:1.5.7")

    // JSON serialization
    implementation("com.google.code.gson:gson:2.11.0")

    // Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
