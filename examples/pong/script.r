score: 0 speed: 4x3
step: does [
    ball/offset: ball/offset + speed
    if any [ball/offset/y < 0 ball/offset/y > 290] [speed: speed * 1x-1]
    if ball/offset/x > 390 [speed: speed * -1x1]
    if all [
        speed/x < 0
        ball/offset/x < 18
        ball/offset/x > 4
        ball/offset/y + 10 > paddle/offset/y
        ball/offset/y < (paddle/offset/y + 60)
    ] [
        speed: speed * -1x1
        score: score + 1
        label/text: form score
    ]
    if ball/offset/x < -10 [score: 0 label/text: "0" ball/offset: 200x150 speed: 4x3]
    show court
]
court: layout [
    origin 0x0 space 0x0
    box 400x300 20.20.40 rate 60 on-time [step] on-key [
        if all [key = "ArrowUp" paddle/offset/y > 0] [paddle/offset: paddle/offset - 0x20]
        if all [key = "ArrowDown" paddle/offset/y < 240] [paddle/offset: paddle/offset + 0x20]
    ]
    at 10x120 paddle: box 8x60 white
    at 200x150 ball: box 10x10 yellow css [border-radius 5]
    at 150x8 label: text 100x30 "0" css [color 255.255.255 font-size 22 text-align "center"]
]
view court
