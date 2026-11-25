// هر بازی این فایل را لود می‌کند تا «در حال بازی» ثبت شود.
import { waitForUser, markPlaying } from "./app.js";

const gameId = location.pathname.split("/").pop().replace(/\.html$/i, "");

waitForUser().then((user) => { if (user) markPlaying(gameId); }).catch(() => {});
