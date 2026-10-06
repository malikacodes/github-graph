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
//
// There are two kinds of key in here. An animating key is in the middle of
// something short that should look good, like the goal key's confetti or a
// burst on the streak key. An idling key is only moving a little so it
// doesn't look frozen, like the streak fire swaying. Idling is the
// background music: it only gets every third tick, about 3 pictures a
// second shared between all the idling keys, and it goes quiet completely
// while anything at all is animating.
const TURN_MS = 100;
const IDLE_EVERY = 3;

// The keys that are animating right now, and what to call to redraw each.
// The idling keys are in a second line of their own.
const waiting = new Map<string, () => void>();
const idling = new Map<string, () => void>();
let metronome: NodeJS.Timeout | undefined;

// Counts the ticks that nothing was animating on, so every third one can
// go to an idling key.
let quiet = 0;

// Puts a key in the queue. Asking again for a key that's already in it
// just swaps in the new redraw.
export function animate(id: string, redraw: () => void): void {
	waiting.set(id, redraw);
	metronome ??= setInterval(nextTurn, TURN_MS);
}

export function stopAnimating(id: string): void {
	waiting.delete(id);
	rest();
}

// The same two for the idling line. A key can be asked for again here as
// often as it likes without losing its place.
export function idle(id: string, redraw: () => void): void {
	idling.set(id, redraw);
	metronome ??= setInterval(nextTurn, TURN_MS);
}

export function stopIdling(id: string): void {
	idling.delete(id);
	rest();
}

// Stops the metronome once both lines are empty. Left running, it would
// wake up ten times a second forever to animate nothing.
function rest(): void {
	if (waiting.size === 0 && idling.size === 0) {
		clearInterval(metronome);
		metronome = undefined;
	}
}

function nextTurn(): void {
	// Anything animating gets the tick, and the idling keys get nothing
	// until that line is empty again.
	if (waiting.size > 0) {
		takeTurn(waiting);
		return;
	}

	quiet++;
	if (quiet % IDLE_EVERY === 0) takeTurn(idling);
}

function takeTurn(line: Map<string, () => void>): void {
	// A map hands its entries back in the order they went in. Taking the
	// first one out and putting it back at the end is what makes the keys
	// take turns.
	const [first] = line;
	if (!first) return;

	const [id, redraw] = first;
	line.delete(id);
	line.set(id, redraw);
	redraw();
}
