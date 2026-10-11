color: 0.0.0 size: 4 tool: 'brush last: none
picture: make image! [520x300 255.255.255]
pick-color: func [new] [color: new swatch/color: new show swatch]
pick-tool: func [new] [tool: new mode/text: form new show mode]
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
    button 60 "Brush" [pick-tool 'brush]
    button 60 "Fill" [pick-tool 'fill]
    button 60 "Eraser" [pick-color 255.255.255 pick-tool 'brush]
    mode: text 50x24 "brush"
    button 34 "2" [size: 2]
    button 34 "6" [size: 6]
    button 34 "14" [size: 14]
    swatch: box 28x24 0.0.0
    return
    canvas: box 520x300 css [cursor "crosshair" touch-action "none"] feel [
        engage: func [face action event] [
            if action = 'down [
                either tool = 'fill [
                    draw picture reduce ['pen color 'flood event/offset]
                ] [
                    last: event/offset
                    draw picture reduce ['pen color 'line-width size 'line last last]
                ]
                show face
            ]
            if all [last action = 'over] [
                draw picture reduce ['pen color 'line-width size 'line last event/offset]
                last: event/offset
                show face
            ]
            if action = 'up [last: none]
        ]
    ]
    return
    button 80 "Clear" [draw picture [pen 255.255.255 box 0x0 519x299] show canvas]
    button 110 "Save as PNG" [download-image canvas "painting.png"]
    button 110 "Count red" [
        copy-picture: to-image canvas
        count: 0
        foreach pixel copy-picture [if pixel/1 > 200 [if pixel/2 < 90 [count: count + 1]]]
        status/text: rejoin [count " red pixels"]
        show status
    ]
    status: text 180x24 ""
]
window: layout spec
canvas/image: picture
view window
