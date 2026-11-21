/**
 * The exit-reason method is one contract on both platforms: the same name and the same answer shape from the Kotlin and Swift modules, declared to
 * React Native on iOS. A platform that lacks it would only show up as "no exit information" on a phone, so the source is checked here.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');
const kotlin = read('android/app/src/main/java/ai/offgridmobile/devicememory/DeviceMemoryModule.kt');
const swift = read('ios/DeviceMemoryModule.swift');
const objc = read('ios/DeviceMemoryModule.m');

describe('DeviceMemoryModule.getLastExitReasons', () => {
  it('exists on Android, on iOS, and is declared to React Native on iOS', () => {
    expect(kotlin).toMatch(/@ReactMethod\s+fun getLastExitReasons\(max: Int, promise: Promise\)/);
    expect(swift).toMatch(/func getLastExitReasons\(_ max: Int,/);
    expect(objc).toMatch(/RCT_EXTERN_METHOD\(getLastExitReasons:\(NSInteger\)max/);
  });

  it('answers { supported, reasons } on both platforms', () => {
    for (const source of [kotlin, swift]) {
      expect(source).toMatch(/"supported"/);
      expect(source).toMatch(/"reasons"/);
    }
    for (const field of ['at', 'reason', 'description', 'rssKb']) expect(kotlin).toContain(`"${field}"`);
  });

  it('names every Android reason code the JS side explains', () => {
    const { explainExit } = require('../../src/services/exitReasons');
    const codes = [...kotlin.matchAll(/-> "([A-Z_]+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(10);
    for (const code of codes) expect(explainExit({ at: 1, reason: code, description: '' })).not.toMatch(/the system reported/);
  });
});
