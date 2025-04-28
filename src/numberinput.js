"use strict";

/**
 * get number of decimal digits for some number n
 * (max 9 decimal digits)
 * @param {null|number|string} n
 * @returns {number} number of decimal digits
 */
function getnumberofdecimaldigits(n) {
    if (n == null) return 0

    // str->float->str round trip to truncate rounding errors in string conversion
    const numberAsStringComponents = parseFloat(parseFloat(n + "").toFixed(9)).toString().split(".")
    if (numberAsStringComponents.length > 1) {
        return numberAsStringComponents[1].length
    }
    return 0
}

/**
 * register input event overrides on (functionally) number input element.
 * enforces numberic limits and step size while typing, so that the field may never contain invalid values.
 * @param {HTMLInputElement} el
 */
export function registerNumberInput(el) {
    // ensure element is supposed to be a number input
    if (el.type != "number") { console.warn(`called registerNumberInput on element with type=${el.type}`, el); return }

    // change its type to text input, because a browser with type=number will not
    // allow certain operations on the element input.
    el.setAttribute("type", "text")

    /** @type {number|null} */
    let minvalue = parseFloat(el.min)
    if (isNaN(minvalue)) minvalue = null
    /** @type {number|null} */
    let maxvalue = parseFloat(el.max)
    if (isNaN(maxvalue)) maxvalue = null
    /** @type {number|null} */
    let stepvalue = parseFloat(el.step)
    if (isNaN(stepvalue)) stepvalue = null

    let numdigits = getnumberofdecimaldigits(stepvalue)
    /**
     * 
     * @param {number} newval
     * @returns {string}
     */
    function formatNumberInput(newval) {
        if (!isFinite(newval)) {
            //console.log("newval is not finite")
        } else if (getnumberofdecimaldigits(newval) > numdigits) {
            //console.log("newval has too many digits",newval,getnumberofdecimaldigits(newval),numdigits)
        } else if (maxvalue != null && newval > maxvalue) {
            //console.log("newval is too large")
        } else if (minvalue != null && newval < minvalue) {
            //console.log("newval is too small")
        } else {
            return parseFloat(newval + "").toFixed(numdigits)
        }

        return (el.value || minvalue || maxvalue || 0) + ""
    }
    // init to proper number of decimal digits. (window.onload is triggered after alpine has finished x-model sync)
    window.addEventListener("load", () => {
        el.value = formatNumberInput(parseFloat(el.value))
    }, { once: true })

    let placeholdervalue = parseFloat(el.getAttribute("placeholder") ?? "")
    if (!isNaN(placeholdervalue)) {
        el.setAttribute("placeholder", formatNumberInput(placeholdervalue))
    }

    el.addEventListener("blur", () => {
        const currentValue = parseFloat(el.value ?? "")

        // if input is valid, write it back.
        // otherwise, (if value is nan, e.g. when the user empties the input)
        // set the value to the placeholder (default) value.
        if (!isNaN(currentValue)) {
            el.value = formatNumberInput(currentValue)
        } else {
            if (isNaN(placeholdervalue)) console.warn("empty input without placeholder")
            el.value = formatNumberInput(placeholdervalue)
        }
    })

    el.addEventListener("keydown", event => {
        // check for valid number of digits
        let keyisnumericinput = "0123456789e+-.".indexOf(event.key) != -1
        let keyismetainput = event.ctrlKey || event.metaKey || (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Backspace", "Delete", "Enter", "End", "Home"].indexOf(event.key) != -1)

        if (!(keyisnumericinput || keyismetainput)) {
            // ignore whatever would happen here
            event.preventDefault()
            return
        }

        if (keyismetainput) {
            // do not prevent input here (just ignore and propagate)

            if (stepvalue != null) {
                let currentvalue = parseFloat(el.value + "")
                if (event.key == "ArrowUp") {
                    // prevent cursor from moving to start of input
                    event.preventDefault()
                    el.value = formatNumberInput(currentvalue + stepvalue)
                } else if (event.key == "ArrowDown") {
                    // prevent cursor from moving to end of input
                    event.preventDefault()
                    el.value = formatNumberInput(currentvalue - stepvalue)
                }
            }
            return
        }

        // we handle input ourselves, no need for default
        event.preventDefault()

        let eventTarget = event.currentTarget
        if (!(eventTarget instanceof HTMLInputElement)) throw new Error("")
        let selectionstart = eventTarget.selectionStart ?? 0
        let selectionend = eventTarget.selectionEnd ?? eventTarget.value.length
        let modifiedinput = parseFloat(
            el.value.toString().substring(0, selectionstart)
            + event.key
            + el.value.toString().substring(selectionend)
        )
        el.value = formatNumberInput(modifiedinput)
        eventTarget.setSelectionRange(selectionstart + 1, selectionstart + 1)

        // trigger input event to e.g. flush x-model on same element
        el.dispatchEvent(new Event('input'))
    })
}