export function checkAdminPassword(password: string | null | undefined) {
  return !!password && password === process.env.ADMIN_PASSWORD;
}
