# TASKVN — GitHub + Cloudflare

## Task logic
- Admin configures each task: title, short URL, reward and max attempts/24h.
- User starts task -> server creates a random one-time claim code.
- User is redirected to the Admin-configured short URL.
- Destination verification submits the claim code to the server.
- Reward is read from the database task record, never from the browser.
- Claim is one-time and has an expiry.
- Completion limit is enforced server-side per user/task for a rolling 24h window.
- Review Map stays pending until Admin approval.
- Withdrawal is pending risk checks before payout.

## Deploy
1. Push the whole folder to GitHub.
2. Create Cloudflare D1 + KV.
3. Put the IDs in wrangler.toml (or configure through Cloudflare).
4. Add GitHub repository secrets:
   - CLOUDFLARE_API_TOKEN
   - CLOUDFLARE_ACCOUNT_ID
5. Push to `main`.

## Security
Cloudflare DDoS/WAF/rate limiting must be enabled in the Cloudflare dashboard. The Worker also has application-level rate limiting. No client-side check should be trusted for money.

## Important
Before handling real money, connect and verify Firebase/Supabase authentication and your payment/payout provider. The Worker intentionally does not invent provider credentials.

## Destination anti-reuse
After successful reward verification, the claim is permanently marked `used` server-side and the destination session is cleared. Returning to the destination later cannot generate a new claim or reuse the old one. Browser cleanup is only cosmetic; the server is authoritative.


## Task attempts
Mỗi lượt hợp lệ tạo claim code mới. Claim đã dùng bị vô hiệu vĩnh viễn. Người dùng vẫn có thể làm lượt tiếp theo khi chưa đạt giới hạn 24 giờ. Khi đủ lượt, API trả TASK_COOLDOWN và giao diện hiển thị bộ đếm; hết thời gian có thể tạo claim mới.


## Authentication
The public app now includes login, registration, logout compatibility with the existing app, and password-reset UI using Supabase Auth. Email confirmation is supported when enabled in Supabase Auth settings. User/admin authorization must still be enforced server-side using verified JWTs and database policies.


## Hidden Admin Login
Tap the TASKVN logo twice within 700ms to open the Admin access-code gate. The UI gate code is 2805. This is only a hidden-entry convenience layer; Admin authorization must still be enforced by Supabase/Cloudflare server-side role checks. Never treat the hidden code as the real security boundary.


## Welcome page
A public introduction/landing screen is shown before the login/register modal. Users can choose Tạo tài khoản or Đăng nhập. Existing application/auth screens remain available.


## Responsive UI
Landing page is optimized desktop-first for 1366px/1440px/1920px displays and remains responsive for tablets and phones. It uses a two-column hero on desktop and collapses cleanly on smaller screens.


## Wallet
Rút MoMo/ngân hàng tối thiểu 50.000đ. Nạp vào Shop tối thiểu 10.000đ bằng tên tài khoản Shop; phần nạp thẻ cào không còn được dùng trong giao diện mới. Payout/Top-up phải được xác thực server-side và kết nối payment/payout provider trước khi dùng tiền thật.
