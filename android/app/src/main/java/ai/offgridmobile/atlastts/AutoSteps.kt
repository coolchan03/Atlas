package ai.offgridmobile.atlastts

/**
 * "Automatic" quality for the cloning voice: start at the best (8 steps) and step down to 5, 3 and then 2 only if this phone
 * cannot make speech comfortably faster than it is spoken. Slow means two generations in a row taking more than [slowAbove] times
 * as long as the speech they made; very short pieces say nothing about speed (a cold start dominates) and are ignored.
 *
 * The voice must not change quality while it is talking (it used to step down in the middle of a sentence run, which sounded like it
 * got worse for no reason). So a decision only takes effect at the start of the next utterance ([beginUtterance]), and it only
 * ever steps down (at most three times in the app's life), so a phone that slows down later (heat, battery) is still caught. The first
 * [warmUp] generation(s) are ignored: loading the model makes them slow on any phone. Pure.
 */
class AutoSteps(private val slowAbove: Double = 0.6, private val warmUp: Int = 1) {
    private val levels = listOf(8, 5, 3, 2)
    /** The level in force for the utterance being made. */
    @Volatile private var level = 0
    /** The level the measurements ask for; it becomes the one in force at the next utterance. */
    private var target = 0
    private var slowInARow = 0
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
        if (factor <= slowAbove) { slowInARow = 0; return }
        slowInARow += 1
        if (slowInARow >= 2 && target < levels.size - 1) { target += 1; slowInARow = 0 }
    }
}
