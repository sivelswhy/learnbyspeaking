import SwiftUI

/// Version publique : pas de menu Dev. Le vrai est dans Dev.local.swift (ignoré par git).
struct DevCommands: Commands {
    let store: Store
    var body: some Commands { EmptyCommands() }
}
