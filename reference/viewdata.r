REBOL [Title: "Writes the color words, the text sizes of each font, and the default facets of each VID style"]
foreach word next first system/words [
    bound: in system/words word
    if all [value? bound tuple? get bound] [print ["color" word get bound]]
]
probe-face: make face [edge: none para: none size: 10000x1000]
foreach font-size [11 12 14 16 20 24] [
    foreach font-style reduce [none 'bold 'italic [bold italic]] [
        probe-face/font: make face/font [size: font-size style: font-style]
        widths: copy []
        repeat code 255 [
            probe-face/text: to-string to-char code
            measured: size-text probe-face
            append widths either measured [measured/x] [0]
        ]
        probe-face/text: "Xg"
        measured: size-text probe-face
        print ["font" font-size mold font-style measured/y widths]
    ]
]
foreach [name style] system/view/vid/vid-styles [
    print ["style" name
        mold style/size
        mold style/color
        mold either object? style/font [reduce [style/font/size style/font/style style/font/color style/font/align style/font/valign]] [none]
        mold either object? style/edge [reduce [style/edge/size style/edge/color style/edge/effect]] [none]
        mold either object? style/para [reduce [style/para/origin style/para/margin]] [none]
        mold style/text
    ]
]
quit
