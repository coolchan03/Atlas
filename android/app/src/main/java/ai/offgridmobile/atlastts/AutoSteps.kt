package ai.offgridmobile.atlastts

/**
 * "Automatic" quality for the cloning voice: start at the best (8 steps) and step down to 5, 3 and then 2 only if this phone
 * cannot make speech comfortably faster than it is spoken. Slow means two generations in a row taking more than [slowAbove] times
 * as long as the speech they made; very short pieces say nothing about speed (a cold start dominates) and are ignored. It only
 * ever steps down, so the quality does not flip back and forth during one reading. Pure.
 */
class AutoSteps(private val slowAbove: Double = 0.6) {
    private val levels = listOf(8, 5, 3, 2)
    @Volatile private var level = 0
    private var slowInARow = 0

    val steps: Int get() = levels[level]

    @Synchronized
    fun record(millis: Long, audioSeconds: Double) {
        if (audioSeconds < 0.5) return
        val factor = millis / 1000.0 / audioSeconds
        if (factor <= slowAbove) { slowInARow = 0; return }
        slowInARow += 1
        if (slowInARow >= 2 && level < levels.size - 1) { level += 1; slowInARow = 0 }
    }
}
