import CoreText
import SwiftUI

// Équivalents natifs de components/ui.tsx et des classes Tailwind de l'app (couleurs, rayons, ombres, police Nunito).

enum Fonts {
    /// Nunito (police variable de l'app web, licence OFL) enregistrée au lancement.
    static func register() {
        for url in Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? [] where url.lastPathComponent.hasPrefix("Nunito-") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}

extension Font {
    /// Police de l'app : Nunito, taille Tailwind (text-sm 14, base 16, lg 18, xl 20, 2xl 24…).
    static func app(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .custom(nunito(weight), size: size * textScale) }
    /// Texte hébreu (classe .he : Arial Hebrew).
    static func he(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .custom([.semibold, .bold, .heavy, .black].contains(weight) ? "ArialHebrew-Bold" : "ArialHebrew", size: size * textScale) }
    /// Une police fixe par graisse (tirées de la police variable du site : la graisse d'une police variable n'est pas appliquée par SwiftUI).
    static func nunito(_ w: Font.Weight) -> String {
        switch w {
        case .medium: return "Nunito-Medium"
        case .semibold: return "Nunito-SemiBold"
        case .bold: return "Nunito-Bold"
        case .heavy: return "Nunito-ExtraBold"
        case .black: return "Nunito-Black"
        default: return "Nunito-Regular"
        }
    }
    /// Taille du texte choisie dans les réglages (Normal, Grand, Très grand).
    static var textScale: CGFloat { let v = UserDefaults.standard.double(forKey: "textScale"); return v > 0 ? v : 1 }
}

extension Color {
    static let lineDeep = Color(hex: 0xcdd8c3)
}

extension View {
    /// shadow-card : 0 1px 2px rgb(20 20 40 / .04), 0 4px 16px rgb(20 20 40 / .05)
    func cardShadow() -> some View {
        shadow(color: Color(red: 20 / 255, green: 20 / 255, blue: 40 / 255).opacity(0.04), radius: 1, y: 1)
            .shadow(color: Color(red: 20 / 255, green: 20 / 255, blue: 40 / 255).opacity(0.05), radius: 8, y: 4)
    }
    /// rounded-2xl bg-card shadow-card
    func card(_ padding: CGFloat = 16, radius: CGFloat = 16) -> some View {
        self.padding(padding).background(Palette.card, in: RoundedRectangle(cornerRadius: radius)).cardShadow()
    }
    /// Texte hébreu : de droite à gauche.
    func rtl() -> some View { environment(\.layoutDirection, .rightToLeft) }
}

/// Btn : bouton en relief (ombre pleine de 4 px dessous), variantes solid / soft / ghost.
struct Btn: ButtonStyle {
    enum Variant { case solid, soft, ghost }
    var variant: Variant = .solid
    var full = false
    var height: CGFloat = 44
    var fontSize: CGFloat = 14
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration c: Configuration) -> some View {
        let (bg, fg, slice): (Color, Color, Color) = switch variant {
        case .solid: (Palette.accent, .white, Palette.accentDeep)
        case .soft: (Palette.soft, Palette.accent, .lineDeep)
        case .ghost: (Palette.card, Palette.ink, .lineDeep)
        }
        let pressed = c.isPressed && enabled
        return c.label
            .font(.app(fontSize, variant == .solid ? .heavy : .bold))
            .foregroundStyle(fg)
            .padding(.horizontal, 20)
            .frame(maxWidth: full ? .infinity : nil, minHeight: height)
            .background(bg, in: RoundedRectangle(cornerRadius: 16))
            .overlay(variant == .ghost ? RoundedRectangle(cornerRadius: 16).stroke(Palette.line, lineWidth: 2) : nil)
            .background(enabled ? slice : .clear, in: RoundedRectangle(cornerRadius: 16).offset(y: pressed ? 0 : 4))
            .offset(y: pressed ? 4 : 0)
            .padding(.bottom, 4)
            .opacity(enabled ? 1 : 0.4)
            .contentShape(Rectangle())
    }
}

/// Chip : choix en relief, plein quand actif.
struct ChipStyle: ButtonStyle {
    var active: Bool
    func makeBody(configuration c: Configuration) -> some View {
        c.label
            .font(.app(14, .bold))
            .foregroundStyle(active ? .white : Palette.ink)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(active ? Palette.accent : Palette.card, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(active ? Palette.accent : Palette.line, lineWidth: 2))
            .background(active ? Palette.accentDeep : .lineDeep, in: RoundedRectangle(cornerRadius: 16).offset(y: c.isPressed ? 0 : 4))
            .offset(y: c.isPressed ? 4 : 0)
            .padding(.bottom, 4)
    }
}

/// Bouton sans style, qui rétrécit un peu à l'appui (active:scale-[0.99]).
struct PressStyle: ButtonStyle {
    var scale: CGFloat = 0.99
    func makeBody(configuration c: Configuration) -> some View {
        c.label.scaleEffect(c.isPressed ? scale : 1).contentShape(Rectangle())
    }
}

/// Flèche retour ronde.
struct BackButton: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.left").font(.system(size: 18, weight: .semibold))
                .frame(width: 44, height: 44).background(Palette.card, in: Circle()).cardShadow()
        }
        .buttonStyle(PressStyle(scale: 0.95)).foregroundStyle(Palette.ink)
        .keyboardShortcut(.escape, modifiers: []).help("Retour")
    }
}

/// En-tête d'écran : retour à gauche, titre centré, action à droite.
struct Header<Right: View>: View {
    let title: String
    var onBack: (() -> Void)?
    @ViewBuilder var right: Right
    var body: some View {
        HStack(spacing: 12) {
            if let onBack { BackButton(action: onBack) }
            Text(title).font(.app(18, .bold)).lineLimit(1).frame(maxWidth: .infinity, alignment: onBack != nil ? .center : .leading)
            if Right.self == EmptyView.self { if onBack != nil { Color.clear.frame(width: 44, height: 44) } } else { right }
        }
        .padding(.horizontal, 16).padding(.top, 20).padding(.bottom, 8)
        .background(Palette.bg.opacity(0.9))
    }
}
extension Header where Right == EmptyView {
    init(title: String, onBack: (() -> Void)? = nil) { self.init(title: title, onBack: onBack) { EmptyView() } }
}

/// Colonne de contenu centrée (max-w-lg / lg:max-w-3xl).
struct Column<C: View>: View {
    var max: CGFloat = 768
    @ViewBuilder var content: C
    var body: some View { content.frame(maxWidth: max).frame(maxWidth: .infinity) }
}

/// Icônes Remix de l'app → symboles SF équivalents.
enum Icon {
    static func scenario(_ id: String) -> String {
        ["free": "bubble.left", "restaurant": "fork.knife", "market": "bag", "meet": "face.smiling", "hotel": "bed.double",
         "airport": "airplane", "taxi": "car", "daily": "house", "study": "graduationcap", "interview": "briefcase"][id] ?? "bubble.left"
    }
}
