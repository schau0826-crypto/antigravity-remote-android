plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val isUniversalBuild = providers.gradleProperty("universal")
    .orNull
    ?.equals("true", ignoreCase = true) == true

android {
    namespace = "com.agremote.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.agremote.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "1.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
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
        buildConfig = true
    }

    androidResources {
        // Keep built-in WebExtension files intact and readable via resource://android/assets/i18n_zh_ext/
        noCompress += listOf("js", "json", "css", "html", "xpi")
    }

    testOptions {
        unitTests {
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    val geckoViewVersion = "160.0.20261116130455"
    if (isUniversalBuild) {
        implementation("org.mozilla.geckoview:geckoview:$geckoViewVersion")
    } else {
        implementation("org.mozilla.geckoview:geckoview-arm64-v8a:$geckoViewVersion")
    }

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")

    testImplementation("junit:junit:4.13.2")
}

configurations.all {
    resolutionStrategy {
        // GeckoView 160's POM references androidx.core:1.19.1 (which demands AGP 9.1.0),
        // while GeckoView itself only calls standard core 1.15 APIs. Pin 1.15.0 for AGP 8.10.1.
        force(
            "androidx.core:core:1.15.0",
            "androidx.core:core-ktx:1.15.0",
            "org.jetbrains.kotlin:kotlin-stdlib:2.1.0",
            "org.jetbrains.kotlin:kotlin-stdlib-jdk7:2.1.0",
            "org.jetbrains.kotlin:kotlin-stdlib-jdk8:2.1.0"
        )
    }
}
