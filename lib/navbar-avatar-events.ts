export const NAVBAR_AVATAR_UPDATE_EVENT = "tan-navbar-avatar-update";

export type NavbarAvatarUpdateDetail = { avatar_url: string | null };

export function dispatchNavbarAvatarUpdate(avatar_url: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NavbarAvatarUpdateDetail>(NAVBAR_AVATAR_UPDATE_EVENT, {
      detail: { avatar_url },
    })
  );
}
