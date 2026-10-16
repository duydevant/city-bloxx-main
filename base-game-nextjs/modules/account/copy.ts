import type { AuthIssue } from "@/lib/api/api-client"
export const copy = {
  signIn: ["Sign in", "Đăng nhập"],
  signUp: ["Create account", "Tạo tài khoản"],
  forgot: ["Forgot password", "Quên mật khẩu"],
  reset: ["Reset password", "Đặt lại mật khẩu"],
  verify: ["Verify email", "Xác thực email"],
  resend: ["Resend verification", "Gửi lại email xác thực"],
  email: ["Email", "Email"],
  password: ["Password", "Mật khẩu"],
  name: ["Full name (optional)", "Họ tên (không bắt buộc)"],
  newPassword: ["New password", "Mật khẩu mới"],
  currentPassword: ["Current password", "Mật khẩu hiện tại"],
  policy: ["Use 12–128 characters for a new password.", "Mật khẩu mới cần 12–128 ký tự."],
  working: ["Please wait…", "Vui lòng đợi…"],
  close: ["Close", "Đóng"],
  guest: ["Continue as Guest", "Tiếp tục chơi Khách"],
  local: [
    "Guest and account progress stay separate. Check the save panel for local and cloud status. Choose Ranked Quick/Daily to submit an online result.",
    "Tiến trình Khách và tài khoản được lưu riêng. Xem bảng lưu để biết trạng thái thiết bị và đám mây. Chọn Quick/Daily xếp hạng để gửi kết quả online.",
  ],
  registered: [
    "Account created. If verification is required, open the email link before signing in.",
    "Đã tạo tài khoản. Nếu cần xác thực, hãy mở liên kết email trước khi đăng nhập.",
  ],
  sent: [
    "If the account is eligible, an email will be sent. Check your inbox and spam folder.",
    "Nếu tài khoản đủ điều kiện, email sẽ được gửi. Hãy kiểm tra hộp thư và thư rác.",
  ],
  verified: ["Email verified. You can now sign in.", "Đã xác thực email. Bạn có thể đăng nhập."],
  resetDone: [
    "Password reset. Sign in with your new password.",
    "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.",
  ],
  saved: ["Account details saved.", "Đã lưu thông tin tài khoản."],
  signOut: ["Sign out", "Đăng xuất"],
  signOutAll: ["Sign out all sessions", "Đăng xuất mọi phiên"],
  confirm: [
    "Sign out? Local progress and unfinished City/Daily towers stay on this device.",
    "Đăng xuất? Tiến trình và City/Daily đang dở vẫn được giữ trên thiết bị này.",
  ],
  cancel: ["Cancel", "Hủy"],
  again: ["Sign in again", "Đăng nhập lại"],
  required: [
    "Account actions are paused. Your local progress is kept.",
    "Thao tác tài khoản đang tạm dừng. Tiến trình trên thiết bị được giữ nguyên.",
  ],
  tokenInvalid: [
    "This link is invalid or expired. Request a new email.",
    "Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu email mới.",
  ],
} as const
export const errorCopy: Record<AuthIssue, readonly [string, string]> = {
  network: [
    "Connection interrupted. Sign in again if the session could not be restored.",
    "Kết nối bị gián đoạn. Hãy đăng nhập lại nếu không khôi phục được phiên.",
  ],
  invalid: [
    "Check the fields or request a new email link.",
    "Kiểm tra thông tin hoặc yêu cầu liên kết email mới.",
  ],
  expired: [
    "Sign-in failed or your session is no longer available. Check credentials and email verification.",
    "Đăng nhập thất bại hoặc phiên không còn khả dụng. Kiểm tra thông tin và xác thực email.",
  ],
  forbidden: [
    "This account action is not allowed. Verify your email or sign in again.",
    "Thao tác tài khoản không được phép. Hãy xác thực email hoặc đăng nhập lại.",
  ],
  conflict: [
    "The account information conflicts with an existing record, or too many sessions are active.",
    "Thông tin trùng với dữ liệu đã có hoặc có quá nhiều phiên đang hoạt động.",
  ],
  rate: [
    "Too many attempts. Please wait before trying again.",
    "Bạn đã thử quá nhiều lần. Hãy đợi trước khi thử lại.",
  ],
  unavailable: [
    "Account service is unavailable. You can keep playing as Guest.",
    "Dịch vụ tài khoản chưa khả dụng. Bạn vẫn có thể chơi Khách.",
  ],
  uncertain: [
    "Session recovery was interrupted. Sign in explicitly; local progress is kept.",
    "Khôi phục phiên bị gián đoạn. Hãy đăng nhập lại; tiến trình trên thiết bị được giữ.",
  ],
  unsupported: [
    "Automatic session recovery is unavailable in this browser. Sign in again when needed.",
    "Trình duyệt này không thể tự khôi phục phiên. Hãy đăng nhập lại khi cần.",
  ],
  "account-changed": [
    "The account changed in another tab. Review the current account before continuing.",
    "Tài khoản đã đổi ở tab khác. Hãy kiểm tra tài khoản hiện tại trước khi tiếp tục.",
  ],
}
