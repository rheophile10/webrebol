/**
 * The music mezzanines that use only words of REBOL 2 Core, as REBOL source text. REBOL 2.7.8 gives the same results for them.
 * The object `music` has the parameters of the sound. A script can change them.
 * In a REBOL string, write the sharp sign of ABC as two carets, because one caret starts an escape.
 */
export const MUSIC_CORE = `
music: make object! [
    rate: 22050
    ticks: 480
    tempo: 120
    level: 100
    steps: 4
    plays: 0
    voice: [sine 1 0.6 sine 2 0.25 sine 3 0.1 fade 0.3 gap 0.1]
]

abc-reader: make object! [
    digit: charset "0123456789"
    letter: charset "ABCDEFGabcdefg"
    sign: charset "^^_="
    mark: charset ",'"
    body-field: charset "IKLMmNPQRrsTUVWw"
    any-field: charset "ABCDFGHIKLMmNOPQRrSsTUVWwXZ"
    semitones: [9 11 0 2 4 5 7]
    sharps: [6 3 7 4 1 5 2]
    key-counts: [3 5 0 2 4 -1 1]
    modes: ["maj" 0 "ion" 0 "mix" -1 "dor" -2 "aeo" -3 "min" -3 "phr" -4 "loc" -5 "lyd" 1 "m" -3]
    tuplets: [3 2 3 2 2 2 3 2]

    notes: title: tempo: none
    whole: unit: meter: 0
    unit-set: in-body: false
    key: bar: voices: none
    voice: now: section-time: section-index: ending-time: ending-index: none
    ties: new-ties: last-events: none
    last-length: 0
    broken: 1
    tuplet-left: 0
    tuplet-ratio: [1 1]
    chord-time: none
    acc: name: marks: num: slashes: den: field: value: count: part: use: none

    start: does [
        notes: make block! 400
        title: copy ""
        tempo: music/tempo
        whole: music/ticks * 4
        unit: whole / 8
        meter: whole
        unit-set: in-body: false
        key: copy [0 0 0 0 0 0 0]
        bar: copy []
        voices: copy []
        voice: 1
        now: section-time: section-index: 0
        ending-time: ending-index: none
        ties: copy []
        new-ties: copy []
        last-events: copy []
        last-length: 0
        broken: 1
        tuplet-left: 0
        chord-time: none
    ]

    count-of: func [text [string! none!] char /local total] [
        total: 0
        if text [foreach item text [if item = char [total: total + 1]]]
        total
    ]

    read-fraction: func [text /local top bottom] [
        top: bottom: none
        parse/all text [any " " copy top some digit opt ["/" copy bottom some digit] to end]
        reduce [either top [to-integer top] [1] either bottom [to-integer bottom] [1]]
    ]

    read-length: func [/local top bottom] [
        top: either num [to-integer num] [1]
        bottom: 1
        if slashes [bottom: either den [to-integer den] [to-integer power 2 length? slashes]]
        reduce [top bottom]
    ]

    scale-length: func [ticks pair] [to-integer (ticks * pair/1 / pair/2) + 0.5]

    take-length: func [/local ticks] [
        ticks: scale-length unit read-length
        if tuplet-left > 0 [ticks: scale-length ticks tuplet-ratio]
        to-integer (ticks * broken) + 0.5
    ]

    set-key: func [text /local tonic count shift] [
        key: copy [0 0 0 0 0 0 0]
        text: trim copy text
        if empty? text [exit]
        tonic: (to-integer first text) - 64
        if any [tonic < 1 tonic > 7] [exit]
        count: pick key-counts tonic
        text: next text
        if all [not tail? text #"#" = first text] [count: count + 7 text: next text]
        if all [not tail? text #"b" = first text] [count: count - 7 text: next text]
        text: trim copy text
        foreach [mode offset] modes [
            if find/match text mode [count: count + offset break]
        ]
        shift: either count > 0 [1] [-1]
        repeat place abs count [
            poke key pick either count > 0 [sharps] [reverse copy sharps] place shift
        ]
    ]

    set-tempo: func [text /local beat rate] [
        beat: [1 4]
        if find text {"} [parse/all text [thru {"} thru {"} copy text to end] text: any [text ""]]
        if rate: find text "=" [
            if find copy/part text rate digit [beat: read-fraction copy/part text rate]
            text: next rate
        ]
        rate: none
        parse/all text [any " " copy rate some digit to end]
        if rate [tempo: to-integer ((to-integer rate) * 4 * beat/1 / beat/2) + 0.5]
    ]

    set-meter: func [text /local pair] [
        pair: either find "Cc" first text [[4 4]] [read-fraction text]
        meter: scale-length whole pair
        if not unit-set [unit: either (pair/1 / pair/2) < 0.75 [whole / 16] [whole / 8]]
    ]

    save-voice: does [
        remove/part find voices voice 2
        append voices voice
        append/only voices reduce [now section-time section-index ending-time ending-index]
    ]

    set-voice: func [text /local name state] [
        name: copy/part text any [find text " " tail text]
        save-voice
        voice: name
        either state: select voices voice [
            set [now section-time section-index ending-time ending-index] state
        ] [
            now: section-time: 0
            section-index: length? notes
            ending-time: ending-index: none
        ]
        bar: copy []
    ]

    set-field: func [name text /local cut] [
        if cut: find text "%" [text: copy/part text cut]
        text: trim copy text
        if empty? text [exit]
        switch name [
            #"T" [if empty? title [title: text]]
            #"L" [unit: scale-length whole read-fraction text unit-set: true]
            #"M" [set-meter text]
            #"Q" [set-tempo text]
            #"K" [set-key text in-body: true]
            #"V" [set-voice text]
        ]
    ]

    next-sound: does [
        ties: new-ties
        new-ties: copy []
        last-events: copy []
    ]

    end-sound: func [ticks] [
        last-length: ticks
        broken: 1
        if tuplet-left > 0 [tuplet-left: tuplet-left - 1]
    ]

    read-pitch: func [/local code low place natural shift] [
        code: to-integer first name
        low: code >= 97
        place: code - either low [96] [64]
        natural: 60 + (pick semitones place) + (either low [12] [0])
        natural: natural + (12 * count-of marks #"'") - (12 * count-of marks #",")
        either acc [
            shift: (count-of acc #"^^") - (count-of acc #"_")
            remove/part find bar natural 2
            append bar reduce [natural shift]
        ] [
            shift: any [select bar natural pick key place]
        ]
        natural + shift
    ]

    emit: func [pitch ticks time /local old] [
        either old: find ties pitch [
            poke notes old/2 ticks + pick notes old/2
            append last-events reduce [pitch old/2]
        ] [
            append notes reduce [time ticks pitch voice]
            append last-events reduce [pitch (length? notes) - 2]
        ]
    ]

    add-note: func [/local ticks] [
        ticks: take-length
        either chord-time [
            emit read-pitch ticks chord-time
            if empty? skip last-events 2 [last-length: ticks]
        ] [
            next-sound
            emit read-pitch ticks now
            now: now + ticks
            end-sound ticks
        ]
    ]

    add-rest: func [bars /local ticks] [
        next-sound
        ticks: either bars [meter * first read-length] [take-length]
        now: now + ticks
        end-sound ticks
    ]

    end-chord: func [/local pair ticks] [
        pair: read-length
        foreach [pitch place] last-events [
            poke notes place scale-length pick notes place pair
        ]
        ticks: scale-length last-length pair
        now: chord-time + ticks
        chord-time: none
        end-sound ticks
    ]

    add-tie: does [
        append new-ties either chord-time [copy skip tail last-events -2] [last-events]
    ]

    break-rhythm: func [side /local small change] [
        small: 1 / power 2 length? part
        change: to-integer side * last-length * (1 - small)
        foreach [pitch place] last-events [poke notes place change + pick notes place]
        now: now + change
        last-length: last-length + change
        broken: either side > 0 [small] [2 - small]
    ]

    start-tuplet: func [/local size] [
        size: to-integer part
        tuplet-left: either use [to-integer use] [size]
        tuplet-ratio: reduce [
            either count [to-integer count] [any [pick tuplets size - 1 2]]
            size
        ]
    ]

    start-section: does [
        section-time: now
        section-index: length? notes
        ending-time: ending-index: none
    ]

    start-ending: func [number] [
        if number = "1" [ending-time: now ending-index: length? notes]
    ]

    end-section: func [/local upto shift items] [
        upto: any [ending-index length? notes]
        shift: now - section-time
        items: copy/part skip notes section-index upto - section-index
        foreach [time ticks pitch owner] items [
            if owner = voice [append notes reduce [time + shift ticks pitch owner]]
        ]
        now: now + (any [ending-time now]) - section-time
        start-section
    ]

    end-bar: does [bar: copy []]

    length-rule: [copy num any digit copy slashes any "/" copy den any digit]

    note-rule: [copy acc any sign copy name letter copy marks any mark length-rule]

    music-rule: [
        any [
            "%" to end
            | {"} thru {"}
            | "!" thru "!"
            | "{" thru "}"
            | "[" copy field body-field ":" copy value to "]" skip (set-field first field any [value ""])
            | ["[" | "|"] copy part ["1" | "2"] (end-bar start-ending part)
            | "[" (next-sound chord-time: now) some [note-rule (add-note) | "-" (add-tie) | " "] "]" length-rule (end-chord)
            | [":||:" | ":|:" | "::"] (end-bar end-section)
            | ":|" opt "]" (end-bar end-section) opt [copy part ["1" | "2"] (start-ending part)]
            | ["|:" | "[|:"] (end-bar start-section)
            | ["||" | "|]" | "[|" | "|"] (end-bar)
            | "(" copy part digit (count: use: none) opt [":" copy count any digit opt [":" copy use any digit]] (start-tuplet)
            | note-rule (add-note)
            | "Z" length-rule (add-rest true)
            | ["z" | "x"] length-rule (add-rest false)
            | "-" (add-tie)
            | copy part some ">" (break-rhythm 1)
            | copy part some "<" (break-rhythm -1)
            | skip
        ]
    ]

    read-line: func [line /local known] [
        if any [empty? line #"%" = first line] [exit]
        known: either in-body [body-field] [any-field]
        either all [(length? line) > 1 #":" = second line find known first line] [
            set-field first line copy skip line 2
        ] [
            if in-body [parse/all/case line music-rule]
        ]
    ]

    read: func [text /local stop] [
        start
        while [not tail? text] [
            stop: any [find text #"^/" tail text]
            read-line trim copy/part text stop
            text: either tail? stop [stop] [next stop]
        ]
        reduce ['title title 'tempo tempo 'ticks music/ticks 'notes notes]
    ]
]

abc-to-score: func [
    "Makes a score from ABC notation. The notes are records of start, length, pitch and voice."
    text [string!]
] [
    abc-reader/read text
]

pitch-to-hertz: func [
    "Gives the frequency of a MIDI pitch."
    pitch [number!]
] [
    440 * power 2 (pitch - 69) / 12
]

tone-maker: make object! [
    parts: fade: gap: none
    name: harmonic: level: amount: none

    part-rule: [
        any [
            set name ['sine | 'square | 'saw | 'triangle] set harmonic integer! set level number!
            (append parts reduce [name harmonic level])
            | 'fade set amount number! (fade: amount)
            | 'gap set amount number! (gap: amount)
            | skip
        ]
    ]

    read: func [instrument] [
        parts: copy []
        fade: 1
        gap: 0.1
        parse instrument part-rule
    ]

    fraction: func [value] [value - to-integer value]

    sample: func [name phase /local place] [
        switch name [
            sine [sine 360 * phase]
            square [either (fraction phase) < 0.5 [1] [-1]]
            saw [(2 * fraction phase) - 1]
            triangle [place: fraction phase + 0.25 1 - abs (4 * place) - 2]
        ]
    ]

    find-span: func [period /local best error span low] [
        best: 1
        low: 1
        repeat count 4 [
            span: to-integer (count * period) + 0.5
            error: abs (span / count) - period
            if error < low [low: error best: count]
        ]
        best
    ]

    make-wave: func [pitch /local period count span wave total phase sum] [
        period: music/rate / pitch-to-hertz pitch
        count: find-span period
        span: max 2 to-integer (count * period) + 0.5
        total: 0
        foreach [name harmonic level] parts [total: total + abs level]
        total: max 1 total
        wave: make block! span
        repeat place span [
            phase: (place - 1) * count / span
            sum: 0
            foreach [name harmonic level] parts [sum: sum + (level * sample name phase * harmonic)]
            append wave sum / total
        ]
        wave
    ]

    make-cycles: func [pitch /local wave cycles size bytes] [
        wave: make-wave pitch
        cycles: reduce [length? wave]
        repeat step music/steps [
            size: music/level * (1 + ((fade - 1) * (step - 1) / max 1 music/steps - 1))
            bytes: make binary! length? wave
            foreach value wave [append bytes to-char 128 + to-integer value * size]
            append cycles bytes
        ]
        cycles
    ]

    make-silence: func [size] [head insert/dup make binary! size to-char 128 max 0 size]

    make-note: func [cycles size /local spans each bytes] [
        spans: to-integer size * (1 - gap) / first cycles
        each: to-integer spans / music/steps
        bytes: make binary! size
        repeat step music/steps [
            insert/dup tail bytes pick cycles step + 1 either step = 1 [spans - (each * (music/steps - 1))] [each]
        ]
        insert/dup tail bytes to-char 128 size - length? bytes
        bytes
    ]
]

make-wav: func [
    "Makes a WAV file of 8 bits and one channel from sample bytes."
    samples [binary!]
    /local number
] [
    number: func [value size /local bytes] [
        bytes: copy #{}
        loop size [append bytes to-char value // 256 value: to-integer value / 256]
        bytes
    ]
    rejoin [
        #{} "RIFF" number 36 + length? samples 4 "WAVEfmt " number 16 4 number 1 2 number 1 2
        number music/rate 4 number music/rate 4 number 1 2 number 8 2
        "data" number length? samples 4 samples
    ]
]

render-score: func [
    "Makes the sample bytes of a score, one binary for each layer of notes that sound at the same time."
    score [block!]
    instrument [block!]
    /local factor place layers layer cache cycles from upto size last-place
] [
    factor: music/rate * 60.0 / ((select score 'tempo) * select score 'ticks)
    place: func [ticks] [to-integer (ticks * factor) + 0.5]
    tone-maker/read instrument
    layers: copy []
    cache: copy []
    last-place: 0
    foreach [time ticks pitch voice] select score 'notes [
        layer: none
        foreach item layers [
            if all [none? layer voice = item/1 item/2 <= time] [layer: item]
        ]
        if none? layer [append/only layers layer: reduce [voice 0 copy []]]
        if none? cycles: select cache pitch [
            cycles: tone-maker/make-cycles pitch
            append cache pitch
            append/only cache cycles
        ]
        from: place time
        upto: place time + ticks
        append layer/3 tone-maker/make-silence from - place layer/2
        append layer/3 tone-maker/make-note cycles upto - from
        layer/2: time + ticks
        last-place: max last-place upto
    ]
    foreach layer layers [append layer/3 tone-maker/make-silence last-place - place layer/2]
    map-each layer layers [join #{} layer/3]
]
`;

/**
 * The music mezzanines that put a sound on the page, as REBOL source text. They use the web word `element`.
 */
const MUSIC_WEB = `
sound-element: func [
    "Makes an audio element that plays a WAV file when the page shows it."
    wav [binary!]
] [
    element 'audio reduce ['src join "data:audio/wav;base64," enbase/base wav 64 'autoplay true] copy []
]

play-score: func [
    "Plays a score in a face. The face gets one audio element for each layer."
    face [object!]
    score [block!]
    /with instrument [block!]
    /local sounds
] [
    sounds: map-each samples render-score score any [instrument music/voice] [sound-element make-wav samples]
    music/plays: music/plays + 1
    face/data: element 'div reduce ['key join "music-" music/plays] sounds
    show face
]

play-abc: func [
    "Plays ABC notation in a face."
    face [object!]
    text [string!]
] [
    play-score face abc-to-score text
]
`;

/**
 * All music mezzanines of WebRebol, as REBOL source text. A session evaluates them one time at its start.
 * @uses MUSIC_CORE, MUSIC_WEB
 * @usedby bootStore (src/session/globals.mjs)
 */
export const MUSIC_BOOT = MUSIC_CORE + MUSIC_WEB;
