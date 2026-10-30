# Phase 6 Android build readiness

30 October 2026. Audited branch `codex/first-party-auth`, starting revision
`fc58387401bcae9c874611718aeb280454ea5c52`.

**Native APK compilation: BLOCKED before execution.** No suitable installed JDK,
Android SDK, adb or emulator was located. This is a missing-toolchain finding, not
a newly observed Windows Application Control denial. No alternative binary was
downloaded or executed, security policy changed, or signing credential replaced.

## Evidence and search scope

- `Get-Command java,javac,adb,emulator,gradle` found only
  `C:\Program Files (x86)\Common Files\Oracle\Java\java8path\java.exe`.
  Its file version is `8.0.4910.10`; the installed runtime is
  `C:\Program Files (x86)\Java\jre1.8.0_491\bin\java.exe`.
  A Java 8 JRE is insufficient for this Gradle/Android build.
- `JAVA_HOME`, `ANDROID_HOME` and `ANDROID_SDK_ROOT` are unset.
- Directory inventories covered Program Files, Program Files (x86), D: root and
  the user's Local AppData. Bounded recursive executable searches covered
  `D:\Dhyan` and Local AppData `Programs`, excluding node_modules, .git and .venv.
  User `.jdks`, `.gradle`, `.android`, standard Android/Adoptium locations,
  `C:\Android`, `D:\Android`, `D:\SDK` and `D:\Tools` were absent.
- Windows installed-program registry inspection found no matching Android Studio,
  JDK/OpenJDK, Adoptium, Zulu or Gradle installation entry in the inspected keys.
- A different project's historical `local.properties` pointed to
  `C:\Users\VICTUS\AppData\Local\Android\sdk`; that path also does not exist.
  It was not copied into PROVIA or modified.
- This bounded audit does not prove that no binary exists anywhere on every disk.
  It establishes that no usable, verified toolchain is available in the inspected
  installation locations or current build environment.

## Exact project requirements

These are read from installed source and generated configuration, not inferred
from older Expo SDK tutorials. Expo is `58.0.21`, React Native `0.88.1`.

| Component | Required/configured value | Evidence |
| --- | --- | --- |
| JDK | 17 recommended for this build | RN and Expo Gradle plugins request JVM toolchain 17; AGP 9.2 requires JDK 17 |
| Gradle | 9.4.1 | `android/gradle/wrapper/gradle-wrapper.properties` |
| Android Gradle Plugin | 9.2.1 | `node_modules/@react-native/gradle-plugin/gradle/libs.versions.toml` |
| Compile SDK | 37 | RN version catalog and Expo root plugin |
| Build tools | 37.0.0 | RN version catalog and Expo root plugin |
| Target SDK | 36 | RN version catalog and Expo root plugin |
| Minimum SDK | 26 | existing expo-build-properties config and generated gradle.properties |
| NDK | 27.1.12297006 | RN version catalog propagated by Expo root plugin |
| CMake | App/module default resolution must be verified by first Gradle run | no project override; Expo source identifies AGP default 3.22.1; RN's separate source-build project requests 3.30.5 |
| Architecture/runtime | New Architecture, Hermes | generated gradle.properties |

Do not mistake RN's own source-build CMake setting for a proven resolved app CMake
version. Install the app's requested version when Gradle reports it. If a Windows
Ninja long-path failure is actually observed, use Expo's supported CMake selection
through configuration only after reviewing that failure; do not edit node_modules.

Official references: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/),
[AGP 9.2 compatibility and 9.2.1 fixes](https://developer.android.com/build/releases/agp-9-2-0-release-notes),
[Android SDK package management](https://developer.android.com/tools/sdkmanager).
AGP's generic default NDK/build-tools versions differ from PROVIA's explicit
React Native/Expo versions; use the project versions above.

## Authorized setup procedure — not executed

1. Have the machine owner/administrator approve a free JDK 17 distribution and
   Google's Android SDK tools under the existing application-control policy.
   Install in an approved location. Android Studio is optional; an emulator is
   optional when using the physical Samsung later. Do not install duplicates if
   the owner supplies an existing approved toolchain location.
2. In Android Studio SDK Manager, or approved Android command-line tools, install
   platform-tools, Android platform 37, build-tools 37.0.0, NDK 27.1.12297006 and
   CMake as required by the first Gradle configuration. Review SDK licenses normally.
   The official sdkmanager reference still documents the commands below, while
   noting migration toward Android CLI; SDK Manager's GUI is also supported.
3. Set process-local paths to the actual approved installation. These examples
   deliberately contain placeholders and must not be run without replacing them:

```powershell
$env:JAVA_HOME = 'C:\APPROVED\jdk-17'
$env:ANDROID_HOME = 'C:\APPROVED\Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
& "$env:JAVA_HOME\bin\java.exe" -version
& "$env:JAVA_HOME\bin\javac.exe" -version
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --list
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" 'platform-tools' 'platforms;android-37' 'build-tools;37.0.0' 'ndk;27.1.12297006' 'cmake;3.22.1'
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
& "$env:ANDROID_HOME\platform-tools\adb.exe" version
```

4. After versions and policy approval are verified, generate and compile without
   installing on a phone. The repository Gradle wrapper supplies Gradle; no global
   Gradle install is needed. Network access for official Gradle/Maven artifacts is
   necessary on this first build.

```powershell
Set-Location 'D:\Dhyan\Self Projects\Provia\apps\mobile'
npx --no-install expo prebuild --platform android --no-install
Set-Location android
.\gradlew.bat --version
.\gradlew.bat :app:assembleDebug --no-daemon --console=plain
```

5. Record the resolved SDK/CMake/JDK versions, exit code, full safe build log and
   generated `app\build\outputs\apk\debug\app-debug.apk` SHA-256. Only then can
   native compilation be marked PASS. Android prebuild and Hermes export alone
   do not establish successful native module linking or APK generation.

The generated local debug keystore is not proof of the existing EAS signing
identity. Do not install a locally debug-signed APK over the user's existing
preview app, uninstall it to resolve a signature mismatch, or clear its data.
Future phone acceptance should use an authorized preview APK with the existing
EAS credentials. The generated local release stanza is also not a production
signing configuration and must not be used to publish an app.

## Application Control and acceptance gates

If an approved tool is blocked, stop and retain its exact absolute path, command,
error text, file SHA-256 and signature information. Ask the administrator to review
the matching timestamp/path in Event Viewer → Applications and Services Logs →
Microsoft → Windows → CodeIntegrity → Operational. Do not disable policy, rename
blocked binaries, or switch to alternative executables to evade enforcement.

No Gradle compile, emulator run, APK install, real camera test or physical-device
success is claimed here. The coordinator's Phase 6 release report records separate
prebuild/Hermes/Doctor results after final source integration. Those results do
not change this native compilation status until the missing toolchain is resolved.
