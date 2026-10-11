const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const settings = read('android/settings.gradle');
const app = read('android/app/build.gradle');
const build = read('android/atlasLlamaKt/build.gradle');
function assert(condition, message) { if (!condition) throw new Error(message); }
assert(settings.includes("include ':atlasLlamaKt'"), 'missing atlasLlamaKt Gradle project');
assert(settings.includes("file('atlasLlamaKt')"), 'missing isolated Android module directory');
assert(app.includes("project(':atlasLlamaKt')"), 'app does not include optional Vulkan engine');
assert(app.includes('atlasVulkanEnabled'), 'Vulkan engine must be opt-in');
assert(build.includes('vendor/llama-kt/llama-kt/src/main/cpp/CMakeLists.txt'), 'native build does not use pinned upstream CMake');
assert(build.includes('vendor/llama-kt/llama-kt/src/main') && build.includes('java.srcDirs') && build.includes('sourceSets.main.kotlin.srcDirs'), 'Kotlin build does not use pinned upstream source set');
assert(build.includes('arm64-v8a'), 'missing ARM64 backend restriction');
assert(build.includes('ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON'), 'Vulkan native library must support Android 16KB pages');
assert(build.includes('jvmToolchain(17)'), 'Vulkan module must target Atlas Java 17 toolchain');
console.log('PASS: experimental Atlas Kotlin/Vulkan Gradle wiring');
