import CoreMotion
import React

@objc(AtlasSensorModule)
class AtlasSensorModule: RCTEventEmitter {
    private let motion = CMMotionManager()
    private let pedometer = CMPedometer()

    override static func requiresMainQueueSetup() -> Bool { return false }

    override func supportedEvents() -> [String]! {
        return ["AtlasMagnetometer", "AtlasPedometer"]
    }

    @objc(startMagnetometer:rejecter:)
    func startMagnetometer(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard motion.isMagnetometerAvailable else { resolve(false); return }
        motion.magnetometerUpdateInterval = 0.1
        motion.startMagnetometerUpdates(to: .main) { [weak self] data, error in
            guard let d = data, error == nil else { return }
            let x = d.magneticField.x, y = d.magneticField.y, z = d.magneticField.z
            let mag = (x * x + y * y + z * z).squareRoot()
            self?.sendEvent(withName: "AtlasMagnetometer",
                            body: ["x": x, "y": y, "z": z, "magnitude": mag])
        }
        resolve(true)
    }

    @objc(stopMagnetometer:rejecter:)
    func stopMagnetometer(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        motion.stopMagnetometerUpdates(); resolve(true)
    }

    @objc(startPedometer:rejecter:)
    func startPedometer(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard CMPedometer.isStepCountingAvailable() else { resolve(false); return }
        pedometer.startUpdates(from: Date()) { [weak self] data, error in
            guard let d = data, error == nil else { return }
            self?.sendEvent(withName: "AtlasPedometer",
                            body: ["steps": d.numberOfSteps.intValue])
        }
        resolve(true)
    }

    @objc(stopPedometer:rejecter:)
    func stopPedometer(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        pedometer.stopUpdates(); resolve(true)
    }
}
