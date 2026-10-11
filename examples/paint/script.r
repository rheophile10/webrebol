color: 0.0.0 size: 4 down?: false
strokes: copy []
pick-color: func [new] [color: new swatch/color: new show swatch]
palette: [0.0.0 255.255.255 220.40.40 240.140.20 250.210.30 60.170.70 40.110.220 150.70.200 120.80.40 130.130.130]
spec: copy [
    across
    h2 "WebRebol paint"
    return
]
foreach shade palette [
    append spec compose/deep [box 28x28 (shade) [pick-color (shade)]]
]
append spec [
    return
    text 60x24 "Brush:"
    button 40 "2" [size: 2]
    button 40 "4" [size: 4]
    button 40 "8" [size: 8]
    button 40 "16" [size: 16]
    text 50x24 "Color:"
    swatch: box 28x24 0.0.0
    button 70 "Eraser" [pick-color 255.255.255]
    button 70 "Clear" [clear strokes show canvas]
    return
    canvas: box 520x300 255.255.255 css [cursor "crosshair" touch-action "none"] feel [
        engage: func [face action event] [
            if action = 'down [
                down?: true
                append strokes reduce ['pen color 'line-width size 'line event/offset event/offset]
                show face
            ]
            if all [down? action = 'over] [append strokes event/offset show face]
            if action = 'up [down?: false]
        ]
    ]
]
window: layout spec
canvas/effect: reduce ['paint strokes]
view window
