import SwiftUI

// Shuli, le renard tuteur : même dessin que components/Avatar.tsx, tracé en natif (Canvas), avec ses expressions,
// le clignement des yeux et la bouche qui bouge quand il parle.

enum Mood { case happy, think, wow, sad, cheer, wink }

enum Palette {
    static let bg = Color(hex: 0xf6f7ee)
    static let card = Color.white
    static let ink = Color(hex: 0x17322a)
    static let muted = Color(hex: 0x5f6b59)
    static let line = Color(hex: 0xe0e8d8)
    static let accent = Color(hex: 0x1f6f50)
    static let accentDeep = Color(hex: 0x14513a)
    static let soft = Color(hex: 0xe3efe0)
    static let honey = Color(hex: 0xf29b2f)
    static let good = Color(hex: 0x2f9663)
    static let warn = Color(hex: 0xc2410c)
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255, opacity: opacity)
    }
}

/// Tracé SVG minimal (M, L, Q, V, H, Z, coordonnées absolues) : assez pour le dessin de Shuli.
func svgPath(_ d: String) -> Path {
    var p = Path()
    let tokens = d.findAll("[MLQVHZ]|-?[0-9.]+")
    var i = 0
    var cmd = ""
    var cur = CGPoint.zero
    func num() -> CGFloat { defer { i += 1 }; return CGFloat(Double(tokens[i]) ?? 0) }
    while i < tokens.count {
        if tokens[i].first?.isLetter == true { cmd = tokens[i]; i += 1; if cmd == "Z" { p.closeSubpath(); continue } }
        switch cmd {
        case "M": cur = CGPoint(x: num(), y: num()); p.move(to: cur); cmd = "L"
        case "L": cur = CGPoint(x: num(), y: num()); p.addLine(to: cur)
        case "Q": let c = CGPoint(x: num(), y: num()); cur = CGPoint(x: num(), y: num()); p.addQuadCurve(to: cur, control: c)
        case "V": cur = CGPoint(x: cur.x, y: num()); p.addLine(to: cur)
        case "H": cur = CGPoint(x: num(), y: cur.y); p.addLine(to: cur)
        default: i += 1
        }
    }
    return p
}

private let BROWS: [Mood: (String, String)] = [
    .happy: ("M104 166 Q136 150 166 164", "M234 164 Q264 150 296 166"),
    .think: ("M104 172 Q136 170 166 176", "M234 150 Q264 136 296 152"),
    .wow: ("M104 150 Q136 130 166 148", "M234 148 Q264 130 296 150"),
    .sad: ("M104 154 Q136 160 166 176", "M234 176 Q264 160 296 154"),
    .cheer: ("M104 160 Q136 142 166 158", "M234 158 Q264 142 296 160"),
    .wink: ("M104 166 Q136 150 166 164", "M234 150 Q264 134 296 152"),
]

struct Avatar: View {
    var mood: Mood = .happy
    var speaking = false
    var size: CGFloat = 96

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 12, paused: !speaking && size < 80)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            // Clignement : 0,15 s toutes les ~5 s (grands avatars seulement) ; bouche : ouverte une image sur deux.
            let blink = size >= 80 && t.truncatingRemainder(dividingBy: 5.2) < 0.15
            let mouthOpen = speaking && Int(t * 6) % 2 == 0
            Canvas { ctx, sz in
                ctx.scaleBy(x: sz.width / 400, y: sz.height / 400)
                draw(ctx, blink: blink, mouthOpen: mouthOpen)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityLabel(speaking ? "Shuli parle" : "Shuli")
    }

    private func draw(_ c: GraphicsContext, blink: Bool, mouthOpen: Bool) {
        let fur = GraphicsContext.Shading.linearGradient(Gradient(colors: [Color(hex: 0xff9a45), Color(hex: 0xf06f2b)]), startPoint: CGPoint(x: 0, y: 40), endPoint: CGPoint(x: 0, y: 360))
        let dark = Color(hex: 0x2a1f1a)
        func fill(_ d: String, _ s: GraphicsContext.Shading) { c.fill(svgPath(d), with: s) }
        func stroke(_ d: String, _ color: Color, _ w: CGFloat) { c.stroke(svgPath(d), with: .color(color), style: StrokeStyle(lineWidth: w, lineCap: .round)) }
        func ellipse(_ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ color: Color) {
            c.fill(Path(ellipseIn: CGRect(x: x - rx, y: y - ry, width: rx * 2, height: ry * 2)), with: .color(color))
        }
        c.fill(Path(CGRect(x: 0, y: 0, width: 400, height: 400)), with: .color(Color(hex: 0xffe3cf)))
        var g = c
        g.translateBy(x: 200, y: 214); g.scaleBy(x: 0.94, y: 0.94); g.translateBy(x: -200, y: -214)
        func gfill(_ d: String, _ s: GraphicsContext.Shading) { g.fill(svgPath(d), with: s) }
        func gstroke(_ d: String, _ color: Color, _ w: CGFloat) { g.stroke(svgPath(d), with: .color(color), style: StrokeStyle(lineWidth: w, lineCap: .round)) }
        func gell(_ x: CGFloat, _ y: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ color: Color) {
            g.fill(Path(ellipseIn: CGRect(x: x - rx, y: y - ry, width: rx * 2, height: ry * 2)), with: .color(color))
        }
        // oreilles
        gfill("M60 190 L66 52 L168 118 Z", fur); gfill("M340 190 L334 52 L232 118 Z", fur)
        gfill("M86 160 L88 92 L142 124Z", .color(Color(hex: 0x3a2a2a))); gfill("M314 160 L312 92 L258 124Z", .color(Color(hex: 0x3a2a2a)))
        // tête et joues
        gfill("M48 200 Q50 110 200 104 Q350 110 352 200 Q354 300 200 352 Q46 300 48 200Z", fur)
        gfill("M48 214 Q130 232 200 300 Q270 232 352 214 Q340 310 200 352 Q60 310 48 214Z", .color(Color(hex: 0xfff6ec)))
        gell(96, 262, 18, 18, Color(hex: 0xff8a7a, opacity: 0.5)); gell(304, 262, 18, 18, Color(hex: 0xff8a7a, opacity: 0.5))
        // yeux
        func eye(_ x: CGFloat, _ px: CGFloat, _ hx: CGFloat, _ lx: CGFloat) {
            if blink { gstroke("M\(x - 28) 214 Q\(x) 226 \(x + 28) 214", dark, 8); return }
            gell(x, 210, 30, 36, .white); gell(px, 215, 16, 18, dark); gell(hx, 208, 5.8, 5.8, .white); gell(lx, 222, 2.6, 2.6, .white.opacity(0.8))
        }
        switch mood {
        case .wink:
            gell(138, 210, 30, 36, .white); gell(141, 215, 16, 18, dark); gell(147, 208, 5.8, 5.8, .white)
            gstroke("M232 218 Q262 190 292 218", dark, 9)
        case .cheer:
            gstroke("M110 220 Q138 190 166 220", dark, 9); gstroke("M234 220 Q262 190 290 220", dark, 9)
        default:
            eye(138, 141, 147, 136); eye(262, 259, 265, 254)
        }
        let brows = BROWS[mood]!
        gstroke(brows.0, Color(hex: 0x8a3d12), 8); gstroke(brows.1, Color(hex: 0x8a3d12), 8)
        // museau
        gell(200, 270, 26, 19, Color(hex: 0x2a1f1f)); gell(193, 264, 8, 4.5, .white.opacity(0.6))
        // bouche
        let mouthDark = Color(hex: 0x7a2a33), tongue = Color(hex: 0xff7a86), nose = Color(hex: 0x2a1f1f)
        if mouthOpen {
            gfill("M170 296 Q200 286 230 296 Q226 330 200 334 Q174 330 170 296Z", .color(mouthDark))
            gfill("M184 318 Q200 310 216 318 Q210 332 200 333 Q190 332 184 318Z", .color(tongue))
            return
        }
        switch mood {
        case .wow: gell(200, 318, 15, 19, mouthDark)
        case .cheer:
            gfill("M166 298 Q200 296 234 298 Q228 340 200 342 Q172 340 166 298Z", .color(mouthDark))
            gfill("M182 326 Q200 316 218 326 Q212 338 200 339 Q188 338 182 326Z", .color(tongue))
        case .think: gstroke("M182 306 Q204 302 224 296", nose, 7)
        case .sad: gstroke("M176 312 Q200 292 224 312", nose, 7)
        default: gstroke("M174 294 Q200 316 226 294", nose, 7)
        }
        gstroke("M200 289 V298", nose, 7)
        _ = fill; _ = stroke; _ = ellipse
    }
}
