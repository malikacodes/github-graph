// Stream Deck can't play a GIF on a key, so an animation is really the
// plugin sending a new still picture over and over. Elgato's limit is 10
// pictures a second, and I'm treating that as a budget for the whole
// plugin, not for each key.
//
// So every animated key shares this one metronome. It ticks ten times a
// second and each tick is one key's turn to send a picture. One key
// animating gets all ten. Two get five each, like two people sharing one
// pen. Animations here work out where they are from the clock (see
// daily-goal.ts), so fewer pictures makes one look less smooth but never
// makes it take longer.
const TURN_MS = 100;

// The keys that are animating right now, and what to call to redraw each.
const waiting = new Map<string, () => void>();
let metronome: NodeJS.Timeout | undefined;

// Puts a key in the queue. Asking again for a key that's already in it
// just swaps in the new redraw.
export function animate(id: string, redraw: () => void): void {
	waiting.set(id, redraw);
	metronome ??= setInterval(nextTurn, TURN_MS);
}

// Takes a key out, and stops the metronome when the queue is empty. Left
// running, it would wake up ten times a second forever to animate nothing.
export function stopAnimating(id: string): void {
	waiting.delete(id);
	if (waiting.size === 0) {
		clearInterval(metronome);
		metronome = undefined;
	}
}

function nextTurn(): void {
	// A map hands its entries back in the order they went in. Taking the
	// first one out and putting it back at the end is what makes the keys
	// take turns.
	const [first] = waiting;
	if (!first) return;

	const [id, redraw] = first;
	waiting.delete(id);
	waiting.set(id, redraw);
	redraw();
}
