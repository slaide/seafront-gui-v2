"use strict";

/**
 * @returns {HardwareCapabilities}
 */
export function getHardwareCapabilities() {
    let plateinfo = {}

    let xhr = new XMLHttpRequest()
    xhr.open("POST", "http://localhost:5002/api/get_features/hardware_capabilities", false)
    xhr.onload = ev => {
        let data = JSON.parse(xhr.response)

        plateinfo = data
    }
    xhr.setRequestHeader("Content-Type", "application/json")
    xhr.send("{}")

    /** @ts-ignore */
    return plateinfo
}

/** @typedef {{label:string, numwells:number, plates:Wellplate[]}} WellPlateGroup */

/**
 * get plate types from server
 * @returns {{plategroups:WellPlateGroup[],allplates:Wellplate[]}}
 * */
export function getPlateTypes() {
    let data = getHardwareCapabilities()

    /** @type {{plategroups:WellPlateGroup[],allplates:Wellplate[]}} */
    let plateinfo = { allplates: [], plategroups: [] }

    for (const key in data.wellplate_types) {
        const value = data.wellplate_types[key]

        // make copy of plate type
        /** @type {Wellplate} */
        const newplate = structuredClone(value)

        plateinfo.allplates.push(newplate)

        /** @type {WellPlateGroup|undefined} */
        let plategroup = plateinfo.plategroups.find(g => g.numwells == newplate.Num_wells_x*newplate.Num_wells_y)
        if (!plategroup) {
            plategroup = {
                label: `${newplate.Num_wells_x*newplate.Num_wells_y} well plate`,
                numwells: newplate.Num_wells_x*newplate.Num_wells_y,
                plates: [],
            }
            plateinfo.plategroups.push(plategroup)
        }
        plategroup.plates.push(newplate)
    }

    // sort by number of wells, in descending order
    plateinfo.plategroups.sort((g1, g2) => parseInt("" + g1.numwells) - parseInt("" + g2.numwells))

    return plateinfo
}

/**
 * @return {AcquisitionConfig}
 **/
export function defaultConfig() {
    /** @ts-ignore @type {AcquisitionConfig} */
    let microscope_config = {}

    /** @type {AcquisitionConfig} */
    let referenceConfig = {
        project_name: "placeholderProject",
        plate_name: "placeholderPlate",
        cell_line: "placeholderCell",

        autofocus_enabled: false,

        grid: {
            num_x: 1,
            delta_x_mm: 0.9,

            num_y: 1,
            delta_y_mm: 0.9,

            num_t: 1,
            delta_t: {
                h: 2,
                m: 1,
                s: 4,
            },

            mask: [{ row: 0, col: 0, selected: true }]
        },

        // some [arbitrary] default
        wellplate_type: {
            "Manufacturer": "Revvity",
            "Model_name": "PhenoPlate 384-well",
            "Model_id_manufacturer": "6057800",
            "Model_id": "revvity-384-6057800",
            "Offset_A1_x_mm": 10.5,
            "Offset_A1_y_mm": 7.36,
            "Offset_bottom_mm": 0.32799999999999996,
            "Well_distance_x_mm": 4.5,
            "Well_distance_y_mm": 4.5,
            "Well_size_x_mm": 3.26,
            "Well_size_y_mm": 3.26,
            "Num_wells_x": 24,
            "Num_wells_y": 16,
            "Length_mm": 127.76,
            "Width_mm": 85.48,
            "Well_edge_radius_mm": 0.1
        },

        plate_wells: [{ col: 0, row: 0, selected: true }],

        channels: getHardwareCapabilities().main_camera_imaging_channels,

        machine_config: []/*getMachineDefaults()*/,
        comment: "",
        spec_version: {
            major: 0,
            minor: 0,
            patch: 0
        },
        timestamp: null
    }

    Object.assign(microscope_config, referenceConfig)

    return microscope_config
}
