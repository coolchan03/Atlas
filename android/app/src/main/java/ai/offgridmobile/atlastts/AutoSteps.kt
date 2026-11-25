package ai.offgridmobile.atlastts

/**
 * "Automatic" quality for the cloning voice: start at the best (8 steps) and step down to 5, 3 and then 2 only if this phone
 * cannot make speech comfortably faster than it is spoken. Slow means two generations in a row taking more than [slowAbove] times
 * as long as the speech they made; very short pieces say nothing about speed (a cold start dominates) and are ignored.
 *
 * The voice must not change quality while it is talking (it used to step down in the middle of a sentence run, which sounded like it
 * got worse for no reason). So a decision only takes effect at the start of the next utterance ([beginUtterance]), and it only
 * steps down when the phone is slow, so a phone that slows down later (heat, battery) is still caught. It also steps back UP: after
 * [recoverAfter] generations in a row that were comfortably fast, and only when the better level would still be fast (the time grows with
 * the steps), so a spell of slowness (the chat model or the radio working at the same time) no longer leaves the voice at 2 or 3 steps
 * for the rest of the session. A change still only takes effect at the start of an utterance. The first [warmUp] generation(s) are
 * ignored: loading the model makes them slow on any phone. Pure.
 */
class AutoSteps(private val slowAbove: Double = 0.6, private val warmUp: Int = 1, private val recoverAfter: Int = 6) {
    private val levels = listOf(8, 5, 3, 2)
    /** The level in force for the utterance being made. */
    @Volatile private var level = 0
    /** The level the measurements ask for; it becomes the one in force at the next utterance. */
    private var target = 0
    private var slowInARow = 0
    private var fastInARow = 0
    private var measured = 0

    val steps: Int get() = levels[level]

    /** Called when a new utterance starts: the quality decided so far applies from here, and not before. */
    @Synchronized
    fun beginUtterance() { level = target }

    @Synchronized
    fun record(millis: Long, audioSeconds: Double) {
        if (audioSeconds < 0.5) return
        measured += 1
        if (measured <= warmUp) return
        val factor = millis / 1000.0 / audioSeconds
        if (factor <= slowAbove) {
            slowInARow = 0
            fastInARow += 1
            // Comfortably fast for a while at the level in force: try the next better one if it would still keep up (time grows with the steps).
            if (fastInARow >= recoverAfter && level == target && target > 0) {
                val predicted = factor * levels[target - 1] / levels[level]
                if (predicted <= slowAbove * 0.85) target -= 1
                fastInARow = 0
            }
            return
        }
        fastInARow = 0
        slowInARow += 1
        if (slowInARow >= 2 && target < levels.size - 1) { target += 1; slowInARow = 0 }
    }
}
