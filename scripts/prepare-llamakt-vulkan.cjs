// Reproducible Atlas build overlay for pinned llama.kt. Keep source gitlink immutable.
// llama.rn already supplies OpenCL; the optional engine only needs Vulkan and CPU.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const vendor = path.resolve(__dirname, '../vendor/llama-kt');
const cmakePath = path.join(vendor, 'llama-kt/src/main/cpp/CMakeLists.txt');
const pin = 'cad0ec95620d0dd951fc277fec0223f9ea4171e4';
const commit = execFileSync('git', ['-C', vendor, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (commit !== pin) throw Error('Refusing to patch unreviewed llama.kt revision ' + commit);
const original = fs.readFileSync(cmakePath, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let cmake = original.replace(/\r\n/g, '\n');
if (cmake.includes('# ATLAS_VULKAN_ONLY')) {
  console.log('Atlas Vulkan-only CMake overlay already applied');
  process.exit(0);
}
const start = cmake.indexOf('set(GGML_OPENCL_KERNELS\n');
const end = cmake.indexOf('add_library(llamakt SHARED\n', start);
if (start < 0 || end <= start) throw Error('Unexpected OpenCL source layout; refusing unsafe modification');
cmake = cmake.slice(0, start) + '# ATLAS_VULKAN_ONLY: OpenCL stays in the original llama.rn runtime.\n' + cmake.slice(end);
const removals = [
  '    ${SRC_DIR}/ggml-opencl/ggml-opencl.cpp\n    ${GGML_OPENCL_KERNEL_HEADERS}\n',
  '    ${SRC_DIR}/../../../../third_party/OpenCL-Headers\n',
  '    -DLM_GGML_USE_OPENCL\n',
  '    -DLM_GGML_OPENCL_USE_ADRENO_KERNELS\n',
  '    -DLM_GGML_OPENCL_EMBED_KERNELS\n',
  '    -DLM_GGML_OPENCL_SOA_Q\n',
  'set(OPENCL_STUB ${CMAKE_CURRENT_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libOpenCL.so)\n',
  'target_link_directories(llamakt PRIVATE\n    ${CMAKE_CURRENT_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}\n)\n',
  '    OpenCL\n',
];
for (const item of removals) {
  if (!cmake.includes(item)) throw Error('Unexpected llama.kt CMake content: ' + item.trim());
  cmake = cmake.replace(item, '');
}
if (!cmake.includes('-DLM_GGML_USE_VULKAN') || !cmake.includes('${GGML_VULKAN_SHADER_SOURCES}')) {
  throw Error('Vulkan backend or embedded shader build missing; refusing to save');
}
fs.writeFileSync(cmakePath, cmake.replace(/\n/g, eol));
console.log('Applied pinned Vulkan-only overlay to llama.kt native build');
