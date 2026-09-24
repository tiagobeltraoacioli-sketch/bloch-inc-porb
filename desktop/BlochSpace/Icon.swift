import AppKit
let output = CommandLine.arguments[1]
for size in [16,32,64,128,192,256,512,1024] {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    let scale = CGFloat(size) / 512
    let transform = NSAffineTransform(); transform.scale(by: scale); transform.concat()
    NSColor(red: 0.027, green: 0.051, blue: 0.043, alpha: 1).setFill()
    NSBezierPath(rect: NSRect(x: 0,y: 0,width: 512,height: 512)).fill()
    NSColor(red: 0.26,green: 0.86,blue: 0.64,alpha: 1).setStroke()
    for angle in [0.0,60.0,120.0] {
        NSGraphicsContext.saveGraphicsState()
        let t=NSAffineTransform();t.translateX(by: 256,yBy: 256);t.rotate(byDegrees: angle);t.concat()
        let ring=NSBezierPath(ovalIn: NSRect(x: -150,y: -65,width: 300,height: 130));ring.lineWidth=9;ring.stroke()
        NSGraphicsContext.restoreGraphicsState()
    }
    NSColor(red: 0.26,green: 0.86,blue: 0.64,alpha: 1).setFill()
    NSBezierPath(ovalIn: NSRect(x: 231,y: 231,width: 50,height: 50)).fill()
    NSColor.white.setFill();NSBezierPath(ovalIn: NSRect(x: 395,y: 247,width: 18,height: 18)).fill()
    image.unlockFocus()
    let rep=NSBitmapImageRep(data:image.tiffRepresentation!)!
    try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:output+"/icon-\(size).png"))
}
