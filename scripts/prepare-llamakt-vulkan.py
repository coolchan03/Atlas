#!/usr/bin/env python3
"""Prepare pinned llama.kt for Atlas's optional Vulkan text module.

Atlas uses llama.rn for Android OpenCL and HTP. The vendored llama.kt
library provides Vulkan and CPU only: linking it to libOpenCL.so would
make it fail to build without a vendor OpenCL link stub and could make it
unloadable on devices with no OpenCL library.

This script intentionally fails when pinned upstream CMake changes.
"""
from pathlib import Path
import sys

target = Path("vendor/llama-kt/llama-kt/src/main/cpp/CMakeLists.txt")
source = target.read_text(encoding="utf-8")
replacements = [
    ("    ${SRC_DIR}/ggml-opencl/ggml-opencl.cpp\n", ""),
    ("    ${GGML_OPENCL_KERNEL_HEADERS}\n", ""),
    ("    -DLM_GGML_USE_OPENCL\n", ""),
    ("    -DLM_GGML_OPENCL_USE_ADRENO_KERNELS\n", ""),
    ("    -DLM_GGML_OPENCL_EMBED_KERNELS\n", ""),
    ("    -DLM_GGML_OPENCL_SOA_Q\n", ""),
    ("    OpenCL\n", ""),
]
for old, new in replacements:
    count = source.count(old)
    if count != 1:
        sys.exit(f"Unexpected pinned llama.kt CMake (expected one instance, found {count}): {old.strip()}")
    source = source.replace(old, new, 1)
if "    OpenCL\n" in source or "    -DLM_GGML_USE_OPENCL\n" in source:
    sys.exit("OpenCL linking/defines still enabled")
target.write_text(source, encoding="utf-8")
print("Patched llama.kt Vulkan module for CPU/Vulkan only; llama.rn OpenCL remains unchanged")
