REBOL [Title: "Writes the name, the type and the parameters of each function, without the help texts"]
foreach word next first system/words [
    bound: in system/words word
    if all [value? bound any-function? get bound] [
        spec: copy third get bound
        remove-each item spec [string? item]
        if block? pick spec 1 [remove spec]
        new-line/all spec false
        foreach item spec [if block? item [new-line/all item false]]
        print [mold word type? get bound mold/only spec]
    ]
]
quit
