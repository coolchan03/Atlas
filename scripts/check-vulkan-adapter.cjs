const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const src = fs.readFileSync(path.resolve(__dirname, '../src/services/vulkanEngine.ts'), 'utf8');
for (const term of ['NativeModules.AtlasVulkan', 'NativeEventEmitter', 'AtlasVulkanToken', 'AtlasVulkanEnd', 'AtlasVulkanError', 'sessionId', 'loadModel(', 'generate(', 'interrupt(', 'unload(', 'listBackends(']) {
  assert.ok(src.includes(term), 'Vulkan adapter missing ' + term);
}
console.log('PASS Vulkan TypeScript native event adapter contract');
