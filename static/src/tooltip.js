"use strict";

const TIME_TO_TOOLTIP_POPUP_MS = 400;
/**
 * @param {HTMLElement} el
 */
export function enabletooltip(el) {
    /** timer to wait a short while between hover start and tooltip popup @type {number?} */
    let timer = null;
    /** tooltip element will be created on demand for this element @type {HTMLElement?} */
    let tooltipelement = null;

    el.addEventListener("mouseenter", starttimer);

    return;

    /** create and display tooltip element */
    function showtooltip() {
        tooltipelement = document.createElement("div")
        tooltipelement.classList.add("tooltip")
        tooltipelement.innerHTML = el.getAttribute("tooltip")??""
        document.body.appendChild(tooltipelement)

        // bounding box of element it references
        const elbb = el.getBoundingClientRect()
        // tooltip bounding box ( to measure width, height, and viewport edge clearance )
        const ttbb = tooltipelement.getBoundingClientRect()

        // initial position: top center of referenced element.
        let left = elbb.left + elbb.width / 2 - ttbb.width / 2
        let top = elbb.top - ttbb.height

        // if tooltip overflows out of the viewport to the right:
        // push back inside (to touch right border)
        const right_overflow = window.innerWidth - (left + ttbb.width)
        if (right_overflow < 0) {
            left += right_overflow
        }
        // if tooltip overflows out of the viewport to the left:
        // push back inside (to touch left border)
        if (left < 0) {
            left = 0
        }
        // if tooltip overflows out of the viewport to the top:
        // push back inside (to touch top border)
        if (top < 0) {
            top = 0
        }
        // bottom overflow is not possible, since the tooltip is positioned at
        // the top center of the element it references.

        tooltipelement.style = `left: ${left}px; top: ${top}px;`
    }
    /** stop tooltip display */
    function stoptooltip() {
        el.removeEventListener("mouseleave", stoptooltip);

        if(tooltipelement){
            tooltipelement.parentElement?.removeChild(tooltipelement);
            tooltipelement = null;
        }

        if(timer){
            clearTimeout(timer);
            timer = null;
        }
    }
    /**
     * initiate waiting to display tooltip timer
     * @param {MouseEvent} event
     * */
    function starttimer(event) {
        el.addEventListener("mouseleave", stoptooltip)
        timer = setTimeout(showtooltip, TIME_TO_TOOLTIP_POPUP_MS)
    }
}
