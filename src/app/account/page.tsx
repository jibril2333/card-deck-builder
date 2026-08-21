import { redirect } from "next/navigation";

/** Account settings live in 设置 now; this address predates that. */
export default function AccountPage() {
  redirect("/digimon/settings");
}
