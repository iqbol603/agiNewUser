const pad = (n) => String(n).padStart(2, '0');

export function setAppTimezone(tz) {
	if (tz && process.env.TZ !== tz) process.env.TZ = tz;
}

export function formatLocalISO(d = new Date()) {
	const offMin = -d.getTimezoneOffset();
	const sign = offMin >= 0 ? '+' : '-';
	const hh = pad(Math.floor(Math.abs(offMin) / 60));
	const mm = pad(Math.abs(offMin) % 60);
	return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`;
}

export function toDbDateTime(d) {
	return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function parseHumanDateRu(input, now = new Date()) {
	const s = String(input || '').trim().toLowerCase();
	if (!s) return null;

	let base = new Date(now);
	let dayShift = 0;
	console.log("date",base);

	if (/\bпослезавтра\b/.test(s)) dayShift = 2;
	else if (/\bзавтра\b/.test(s)) dayShift = 1;
	else if (/\bсегодня\b/.test(s)) dayShift = 0;
	
	// Добавляем поддержку "через X дней"
	const throughMatch = s.match(/\bчерез\s+(\d+)\s+дн(?:я|ей)?\b/);
	if (throughMatch) {
		dayShift = parseInt(throughMatch[1]);
	}

	// dd.mm(.yyyy)
	const mDate = s.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/);

	// "в 10", "в 10:30", "10:00", "10 часов", "10ч"
	const mTime = s.match(/\b(?:в\s*)?(\d{1,2})(?::(\d{2}))?\s*(?:час(?:ов|а)?|ч)?\b/);

	const isMorning = /\bутр[ао]?\b/.test(s);
	const isEvening = /\bвечер[ао]?\b/.test(s) || /\bноч[ьи]\b/.test(s);

	let d;
	if (mDate) {
		let [, dd, mm, yy] = mDate;
		const year = yy ? (yy.length === 2 ? (2000 + Number(yy)) : Number(yy)) : now.getFullYear();
		d = new Date(year, Number(mm) - 1, Number(dd));
	} else {
		d = new Date(base);
		d.setDate(d.getDate() + dayShift);
	}

	let hour = 10, minute = 0; // дефолт "утром"
	
	if (mTime) {
		hour = Number(mTime[1]);
		minute = mTime[2] ? Number(mTime[2]) : 0;
	}

	if (isEvening && hour < 12) hour += 12;
	if (isMorning && hour === 12) hour = 0;

	d.setHours(hour, minute, 0, 0);
	return d;
}