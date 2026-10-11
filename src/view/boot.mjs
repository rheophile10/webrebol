/**
 * The View mezzanines of WebRebol, as REBOL source text. A session evaluates them one time at its start.
 * The object `theme` has the parameters of the look. A script can change them.
 */
export const VIEW_BOOT = `
theme: make object! [
    font-family: "Arial, Helvetica, sans-serif"
    tags: [
        button "button" btn "button" toggle "button" rotary "button"
        field "input" info "input" area "textarea"
        check "input" radio "input" slider "input" progress "progress"
        choice "select" drop-down "select" image "img"
    ]
    types: [check "checkbox" radio "radio" slider "range"]
    colors: [button 44.80.132 toggle 44.80.132 field 255.255.255 info 240.240.240 area 255.255.255]
    css: [button [cursor "pointer"] btn [cursor "pointer"] toggle [cursor "pointer"]]
]

face-css: func [face /local css color] [
    css: reduce [
        'position "absolute" 'box-sizing "border-box" 'margin 0 'padding 0 'overflow "hidden"
        'left face/offset/x 'top face/offset/y 'width face/size/x 'height face/size/y
        'font-family theme/font-family
    ]
    if color: any [face/color select theme/colors face/style] [append css reduce ['background-color color]]
    if object? face/font [
        append css reduce ['font-size face/font/size 'color face/font/color 'text-align form face/font/align]
        if find form face/font/style "bold" [append css [font-weight "bold"]]
        if find form face/font/style "italic" [append css [font-style "italic"]]
    ]
    if object? face/edge [
        append css reduce ['border-style "solid" 'border-width face/edge/size/x 'border-color face/edge/color]
    ]
    foreach [name extra] theme/css [if name = face/style [append css extra]]
    if block? face/css [append css face/css]
    css
]

face-to-element: func [face /local tag props kids type] [
    tag: any [select theme/tags face/style "div"]
    props: reduce ['class join "wr-" form any [face/style 'window] 'style face-css face 'data-face face]
    kids: copy []
    either find ["input" "textarea"] tag [
        if face/text [append props reduce ['value face/text]]
        append props [data-oninput "text"]
    ] [
        if face/text [append kids face/text]
    ]
    if type: select theme/types face/style [append props reduce ['type type]]
    if block? face/action [append props reduce ['data-onclick face/action]]
    if block? face/on-time [append props reduce ['data-ontime face/on-time 'data-rate any [face/rate 10]]]
    if block? face/on-key [append props reduce ['data-onkey face/on-key]]
    if block? face/on-down [append props reduce ['data-onpointerdown face/on-down]]
    if block? face/on-move [append props reduce ['data-onpointermove face/on-move]]
    if block? face/on-up [append props reduce ['data-onpointerup face/on-up]]
    if block? face/pane [foreach child face/pane [append kids face-to-element child]]
    if block? face/effect [
        if find face/effect 'reveal [append kids reveal-element face]
        if find face/effect 'draw [append kids draw-element face select face/effect 'draw]
    ]
    element tag props kids
]

draw-element: func [face commands /local shapes pen width fill points item] [
    shapes: copy []
    pen: 0.0.0
    width: 1
    fill: none
    while [not tail? commands] [
        item: first commands
        commands: next commands
        switch item [
            pen [pen: first commands commands: next commands]
            fill-pen [fill: first commands commands: next commands]
            line-width [width: first commands commands: next commands]
            line [
                points: copy []
                while [all [not tail? commands pair? first commands]] [append points first commands commands: next commands]
                append shapes element "polyline" reduce [
                    'points form-points points 'stroke pen 'stroke-width width
                    'fill "none" 'stroke-linecap "round" 'stroke-linejoin "round"
                ] copy []
            ]
            box [
                append shapes element "rect" reduce [
                    'x first first commands 'y second first commands
                    'width (first second commands) - (first first commands)
                    'height (second second commands) - (second first commands)
                    'stroke pen 'stroke-width width 'fill any [fill "none"]
                ] copy []
                commands: skip commands 2
            ]
            circle [
                append shapes element "circle" reduce [
                    'cx first first commands 'cy second first commands 'r second commands
                    'stroke pen 'stroke-width width 'fill any [fill "none"]
                ] copy []
                commands: skip commands 2
            ]
        ]
    ]
    element "svg" reduce [
        'width face/size/x 'height face/size/y
        'style [position "absolute" left 0 top 0 pointer-events "none"]
    ] shapes
]

reveal-element: func [face /local spec] [
    spec: face/effect
    element "canvas" reduce [
        'class "wr-reveal" 'width face/size/x 'height face/size/y
        'style [position "absolute" left 0 top 0 pointer-events "none"]
        'data-reveal select spec 'times
        'data-grid select spec 'grid
        'data-duration select spec 'duration
        'data-lights select spec 'lights
        'data-cover select spec 'cover
        'data-run select spec 'run
    ] copy []
]

atan2: func [y x] [
    case [
        x > 0 [arctangent/radians y / x]
        all [x < 0 y >= 0] [(arctangent/radians y / x) + pi]
        x < 0 [(arctangent/radians y / x) - pi]
        y > 0 [pi / 2]
        y < 0 [pi / -2]
        true [0]
    ]
]

reveal-timers: reduce [
    'dissolve func [cell grid] [(0.8 * hash-cell cell) + (0.2 * find-threshold cell)]
    'wipe func [cell grid] [(cell/x / grid/x) + (0.03 * hash-cell cell)]
    'blinds func [cell grid] [(0.75 * ((cell/y // 10) / 10)) + (0.25 * (cell/x / grid/x))]
    'ripple func [cell grid /local distance] [
        distance: measure-center cell grid
        (0.55 * distance) + (0.45 * ((distance * 6) // 1))
    ]
    'melt func [cell grid] [
        (0.6 * smooth-noise as-pair cell/x 0 4) + (0.08 * hash-cell as-pair cell/x 0) + (0.4 * (cell/y / grid/y))
    ]
    'sweep func [cell grid /local angle] [
        angle: atan2 (cell/y + 0.5 - (grid/y / 2)) (cell/x + 0.5 - (grid/x / 2))
        (((angle + (2.5 * pi)) // (2 * pi)) / (2 * pi)) + (0.01 * hash-cell cell)
    ]
    'glitch func [cell grid /local strip] [
        strip: to-integer cell/y / 3
        (0.8 * hash-cell as-pair 7 strip) + (0.2 * hash-cell as-pair to-integer cell/x / 9 strip)
    ]
    'burn func [cell grid /local rough] [
        rough: (0.6 * smooth-noise cell 5) + (0.25 * hash-cell cell) + (0.15 * find-threshold cell)
        ((measure-center cell grid) * 0.65) + (rough * 0.35)
    ]
]

reveal-looks: [
    dissolve [band 0.12 duration 1400 lights [0 0.12 233.213.255 1 0]]
    wipe [band 0.1 duration 1300 lights [-0.012 0 255.255.255 2 2 0 0.1 34.211.238 0.9 0]]
    blinds [band 0.05 duration 1200 lights [0 0.05 250.204.21 1.2 0]]
    ripple [band 0.1 duration 1700 lights [0 0.015 240.249.255 2 2 0.015 0.1 56.189.248 0.85 0]]
    melt [band 0.12 duration 1800 lights [0 0.02 217.249.157 2 2 0.02 0.12 34.197.94 0.83 0]]
    sweep [band 0.07 duration 1500 lights [0 0.008 245.243.255 2 2 0.008 0.07 167.139.250 0.7 0]]
    glitch [band 0.08 duration 1000 lights [0 0.08 255.0.80 1.3 0]]
    burn [band 0.2 duration 2200 lights [-0.1 0 219.39.119 0 0.7 0 0.07 255.250.220 2 1 0.07 0.2 249.115.22 1 0]]
]

make-reveal-field: func [grid timer band /local times low span] [
    times: copy []
    repeat row grid/y [repeat column grid/x [append times timer as-pair column - 1 row - 1 grid]]
    low: first minimum-of times
    span: (first maximum-of times) - low
    map-each time times [either span > 0 [((1 - band) * (time - low)) / span] [1 - band]]
]

make-reveal: func [name grid cover /local look] [
    look: select reveal-looks name
    reduce [
        'reveal name 'grid grid 'cover cover 'run 1
        'duration select look 'duration
        'lights select look 'lights
        'times make-reveal-field grid select reveal-timers name select look 'band
    ]
]
`;
