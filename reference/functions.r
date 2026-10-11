REBOL [Title: "Writes the name, the type and the specification of each function"]
foreach word next first system/words [
    bound: in system/words word
    if all [value? bound any-function? get bound] [
        print [mold word type? get bound mold third get bound]
    ]
]
quit
