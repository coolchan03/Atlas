# Keep rules for the R8 trial build (-PatlasMinify=true). They only matter when minification is on.
# The rule of thumb: anything a native (.so) library, the React Native bridge or a reflection-based library reaches by NAME must be kept.

# Native methods and the classes that declare them (JNI looks them up by name).
-keepclasseswithmembernames,includedescriptorclasses class * { native <methods>; }

# React Native bridge: modules are found by annotation, and their @ReactMethod methods are called by name from JavaScript.
-keep @com.facebook.react.module.annotations.ReactModule class * { *; }
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod <methods>; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * implements com.facebook.react.ReactPackage { *; }

# Atlas's own native modules (downloads, voices, Vulkan, image generation, LiteRT, device tools).
-keep class ai.offgridmobile.** { *; }

# Native engines and their Java halves.
-keep class com.rnllama.** { *; }
-keep class com.rnwhisper.** { *; }
-keep class com.tensai.llamakt.** { *; }
-keep class com.k2fsa.sherpa.onnx.** { *; }
-keep class com.google.ai.edge.** { *; }
-keep class com.google.mediapipe.** { *; }
-keep class org.tensorflow.** { *; }
-keep class com.learnium.RNDeviceInfo.** { *; }
-keep class com.rnziparchive.** { *; }
-dontwarn com.google.ai.edge.**
-dontwarn com.google.mediapipe.**
-dontwarn org.tensorflow.**

# Keep annotations and the information stack traces and reflection need.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
