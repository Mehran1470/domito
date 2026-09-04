# دومیتو — سالن مینی‌گیم‌های آنلاین

سایتی که کاربرها با اسم وارد می‌شن، بین بازی‌ها رای می‌دن، پرطرفدارترین بازی شروع می‌شه، و آمار برد/باخت هر نفر ذخیره می‌مونه.

فعلاً ۳ بازی ساده آماده‌ست (کوییز، سرعت واکنش، حافظه) تا ساختار تست بشه. بعداً می‌تونیم بقیه ۷ بازی رو با همین الگو اضافه کنیم.

## ۱) ساخت پروژه Firebase (رایگان)

1. برو به [console.firebase.google.com](https://console.firebase.google.com) و یه پروژه جدید بساز.
2. از منوی سمت چپ برو `Build → Realtime Database` و یه دیتابیس بساز (نه Firestore، همون **Realtime Database**).
3. حالت شروع رو روی **test mode** بذار (بعداً می‌تونی قوانین امنیتی رو سفت‌تر کنی).
4. از منوی `Build → Authentication → Sign-in method`، گزینه **Anonymous** رو فعال کن.
5. برو `Project settings → General`، پایین صفحه یه اپ وب (`</>`) اضافه کن، و مقادیر config رو کپی کن.

فایل `js/firebase-config.js` رو باز کن و مقادیرت رو جایگزین کن:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

### قوانین Realtime Database (برای شروع، ساده)

توی تب Rules دیتابیس این رو بذار:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

این یعنی فقط کاربرهای وارد‌شده (حتی به‌صورت ناشناس) می‌تونن بخونن/بنویسن — برای یه سایت دوستانه کافیه.

## ۲) اجرای محلی

چون از ماژول‌های JS (`type="module"`) استفاده شده، باید از یه سرور محلی سرو بشه (مستقیم باز کردن فایل کار نمی‌کنه). مثلاً:

```bash
npx serve .
```

یا با افزونه Live Server توی VS Code.

## ۳) آپلود روی گیت‌هاب و فعال‌سازی GitHub Pages

1. یه ریپازیتوری جدید بساز و کل پوشه `domito` رو داخلش push کن.
2. برو `Settings → Pages`، از قسمت Source شاخه `main` و پوشه `/root` رو انتخاب کن.
3. بعد چند دقیقه سایت روی آدرس `https://USERNAME.github.io/REPO_NAME/` بالا میاد.

⚠️ نکته: چون `firebase-config.js` رو داخل ریپازیتوری عمومی می‌ذاری، کلیدهای Firebase قابل مشاهده‌ن. این طبیعیه و مشکلی نداره چون Firebase امنیت رو با **Security Rules** تأمین می‌کنه، نه با مخفی کردن apiKey.

## ۴) ساختار پروژه

```
domito/
  index.html        ← صفحه ورود با اسم
  lobby.html         ← سالن انتظار + رای‌گیری
  profile.html        ← پروفایل و آمار
  games/
    quiz.html
    reaction.html
    memory.html
  css/style.css
  js/
    app.js            ← هسته مشترک (Firebase, سشن, پروفایل)
    firebase-config.js ← اطلاعات پروژه Firebase تو (باید پرش کنی)
```

## ۵) چطور بازی جدید اضافه کنم؟

1. یه فایل جدید مثل `games/newgame.html` بساز (از روی یکی از بازی‌های موجود کپی کن).
2. توی `js/app.js`، آرایه `GAMES` رو باز کن و یه آیتم جدید اضافه کن:
   ```js
   { id: "newgame", name: "اسم بازی", desc: "توضیح کوتاه" }
   ```
3. توی بازی جدید، در پایان باید حتماً `submitResult("newgame", myUid, myName, score)` رو صدا بزنی تا امتیاز ثبت بشه. بقیه منطق (رای‌گیری، ریست سشن، بروزرسانی پروفایل) خودکاره.

## ۶) لوگو

فعلاً یه آیکون دومینو (🁢) به‌جای لوگو گذاشته شده. هروقت عکس لوگوی «دومیتو» رو داشتی، کافیه:
1. عکس رو با اسم `logo.png` توی پوشه اصلی بذاری.
2. توی همه فایل‌های html، این خط رو:
   ```html
   <div class="brand-mark">🁢</div>
   ```
   با این جایگزین کنی:
   ```html
   <img src="logo.png" alt="دومیتو" class="brand-mark" style="object-fit:cover;">
   ```
   (توی `games/*.html` مسیرش می‌شه `../logo.png`)
