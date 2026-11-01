import AppKit

/// Version publique : pas de menu Debug. Le vrai menu est dans Debug.local.swift (ignoré par git).
func debugMenuItems(_ ctx: DebugContext) -> [NSMenuItem] { [] }
