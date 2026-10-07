import { ApiRoutes } from "@/lib/routes"
import type { AuthTokens } from "@/lib/api/types"

// TODO: nối BE thật — các hàm dưới đây chỉ là scaffold, chưa gọi API nào
// thực sự hoạt động. Khi có BE, giữ nguyên signature (api-client.ts đã wire
// sẵn interceptor refresh-token dựa trên `refreshTokenApi`), chỉ cần implement
// đúng response shape.

export async function loginApi(email: string, password: string): Promise<AuthTokens> {
  void email
  void password
  throw new Error("TODO: loginApi chưa nối BE — implement khi có endpoint " + ApiRoutes.AUTH_LOGIN)
}

export async function refreshTokenApi(refreshToken: string): Promise<AuthTokens> {
  // TODO: implement thật, ví dụ:
  // import { apiClient } from "@/lib/api/api-client"
  // const { data } = await apiClient.post(ApiRoutes.AUTH_REFRESH, { refreshToken })
  // return data
  void refreshToken
  throw new Error("TODO: refreshTokenApi chưa nối BE — implement khi có endpoint " + ApiRoutes.AUTH_REFRESH)
}
