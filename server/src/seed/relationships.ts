/**
 * Curated standard relationships. Every edge records provenance:
 * - OFFICIAL_CATALOGUE: stated in an official government document (source linked).
 * - CURATED_EXPERT: a domain relationship curated for the benchmark; it must
 *   be checked against the normative-references clause of the standard.
 * No edge is marked as verified.
 */
import type { RelationshipRecord, SourceRef } from '../../../shared/knowledge';
import type { CuratedRelationshipType } from '../../../shared/constants';
import { MOP_EVCI_2024, UNVERIFIED } from './standards';

const CEA_2023: SourceRef = {
  name: 'CEA (Measures relating to Safety and Electric Supply) Regulations, 2023 — Chapter XI',
  url: 'https://cea.nic.in/wp-content/uploads/regulations_cpt/2023/06/pdf_100_183_English-1.pdf',
  retrievedAt: '2026-09-25',
  sourceType: 'GAZETTE_NOTIFICATION',
};

function rel(
  fromId: string,
  type: CuratedRelationshipType,
  toId: string,
  statement: string,
  options: { official?: SourceRef; contextNote?: string } = {},
): RelationshipRecord {
  return {
    id: `${fromId}--${type.toLowerCase().replace(/_/g, '-')}--${toId}`,
    fromId,
    toId,
    type,
    provenance: options.official
      ? { type: 'OFFICIAL_CATALOGUE', statement, source: options.official }
      : { type: 'CURATED_EXPERT', statement: `${statement} (Curated relationship — confirm against the standard's normative references.)` },
    ...(options.contextNote ? { contextNote: options.contextNote } : {}),
    verification: UNVERIFIED,
    lifecycle: 'PUBLISHED',
  };
}

export const RELATIONSHIPS: RelationshipRecord[] = [
  // --- AC EV charging (IS 17017 Part 1)
  rel('is-17017-1', 'RELATED_PRODUCT', 'is-17017-2-2', 'The MoP EV charging infrastructure guidelines (2024), Annexure I, map AC parkbay charging (11/22 kW) to IS 17017 (Part 1) together with IS 17017 (Part 2/Sec 2) connectors.', { official: MOP_EVCI_2024 }),
  rel('is-17017-1', 'RELATED_STANDARD', 'is-iso-15118-2', 'The MoP EV charging infrastructure guidelines (2024), Annexure I, list IS 15118 communication for AC parkbay charging.', { official: MOP_EVCI_2024, contextNote: 'Confirm which parts of the IS/ISO 15118 series the purchaser requires.' }),
  rel('is-17017-1', 'TEST_METHOD', 'is-17017-21-2', 'EMC requirements and tests for off-board charging equipment are specified in Part 21/Sec 2 of the same series.'),
  rel('is-17017-1', 'RELATED_STANDARD', 'is-iec-60529', 'Enclosure ingress protection of EV supply equipment is expressed with the IP code of IS/IEC 60529.', { contextNote: 'Particularly relevant for outdoor installation.' }),
  rel('is-17017-1', 'SAFETY', 'is-12640-1', 'EV supply equipment requires residual current protection; RCCBs for household and similar uses are specified in IS 12640 (Part 1).', { contextNote: 'Confirm the residual current device type required for d.c. fault conditions against IS 17017 (Part 1).' }),
  rel('is-17017-1', 'SAFETY', 'is-iec-60898-1', 'The CEA Safety Regulations 2023 (Chapter XI) require a dedicated sub-circuit with overcurrent protection for EV charging; MCBs for overcurrent protection are specified in IS/IEC 60898-1.', { contextNote: `Regulatory basis: ${CEA_2023.name}.` }),
  rel('is-17017-1', 'INSTALLATION', 'is-732', 'Electrical wiring for the charging installation is carried out under the code of practice for wiring installations.', { contextNote: 'CEA Safety Regulations 2023 Chapter XI adds EV-specific installation requirements.' }),
  rel('is-17017-1', 'INSTALLATION', 'is-3043', 'Earthing of the charging installation follows the code of practice for earthing; CEA regulations also require earth-continuity monitoring for EV charging.'),
  rel('is-17017-2-2', 'NORMATIVE_REFERENCE', 'is-17017-2-1', 'Section 2 (a.c. accessory dimensions) is used together with the general requirements for accessories in Part 2/Sec 1.'),

  // --- DC EV charging (IS 17017 Part 23)
  rel('is-17017-23', 'NORMATIVE_REFERENCE', 'is-17017-1', 'Part 23 (d.c. EV supply equipment) is used together with the general requirements of Part 1.'),
  rel('is-17017-23', 'RELATED_PRODUCT', 'is-17017-2-3', 'The MoP EV charging infrastructure guidelines (2024), Annexure I, map DC charging (50–500 kW) to IS 17017 (Part 23), IS 17017 (Part 24), IS 15118 and IS 17017 (Part 2/Sec 3).', { official: MOP_EVCI_2024 }),
  rel('is-17017-23', 'RELATED_STANDARD', 'is-17017-24', 'The MoP EV charging infrastructure guidelines (2024), Annexure I, list IS 17017 (Part 24) for DC charging communication.', { official: MOP_EVCI_2024 }),
  rel('is-17017-23', 'RELATED_STANDARD', 'is-iso-15118-2', 'The MoP EV charging infrastructure guidelines (2024), Annexure I, list IS 15118 for DC charging.', { official: MOP_EVCI_2024 }),
  rel('is-17017-23', 'TEST_METHOD', 'is-17017-21-2', 'EMC requirements and tests for off-board chargers are specified in Part 21/Sec 2.'),
  rel('is-17017-23', 'RELATED_STANDARD', 'is-iec-60529', 'Enclosure ingress protection is expressed with the IP code of IS/IEC 60529.', { contextNote: 'Particularly relevant for outdoor installation.' }),
  rel('is-17017-23', 'SAFETY', 'is-iec-60898-1', 'The CEA Safety Regulations 2023 (Chapter XI) require overcurrent protection of the EV charging sub-circuit; MCBs for overcurrent protection are specified in IS/IEC 60898-1.', { contextNote: `Regulatory basis: ${CEA_2023.name}.` }),
  rel('is-17017-23', 'INSTALLATION', 'is-732', 'Electrical wiring for the charging installation is carried out under the code of practice for wiring installations.'),
  rel('is-17017-23', 'INSTALLATION', 'is-3043', 'Earthing of the charging installation follows the code of practice for earthing.'),
  rel('is-17017-23', 'TERMINOLOGY', 'is-1885-27', 'D.C. chargers are power electronic converters; the power electronics vocabulary defines the related terms.'),
  rel('is-17017-23', 'RELATED_PRODUCT', 'is-17017-30', 'Dual-gun d.c. EV supply equipment is covered by a separate part of the series.'),

  // --- Light EV charging
  rel('is-17017-22-1', 'NORMATIVE_REFERENCE', 'is-17017-1', 'The LEV a.c. charge point standard was developed on the basis of IS 17017 (Part 1) : 2018.'),
  rel('is-17017-22-1', 'SAFETY', 'is-12640-1', 'Residual current protection for the charge point circuit is provided by RCCBs as specified in IS 12640 (Part 1).'),
  rel('is-17017-22-1', 'INSTALLATION', 'is-732', 'Charge point wiring follows the code of practice for wiring installations.'),
  rel('is-17017-22-1', 'INSTALLATION', 'is-3043', 'Earthing follows the code of practice for earthing.'),
  rel('is-17017-25', 'RELATED_PRODUCT', 'is-17017-2-6', 'The MoP EV charging infrastructure guidelines (2024), Annexure I, map LEV DC charging (≤12 kW) to IS 17017 (Part 25) and IS 17017 (Part 2/Sec 6).', { official: MOP_EVCI_2024 }),
  rel('is-17017-31', 'RELATED_PRODUCT', 'is-17017-2-7', 'The MoP EV charging infrastructure guidelines (2024), Annexure I, map LEV AC/DC combined charging to IS 17017 (Part 31) and IS 17017 (Part 2/Sec 7).', { official: MOP_EVCI_2024 }),

  // --- Protection devices & installation
  rel('is-12640-1', 'TERMINOLOGY', 'is-1885-17', 'Switchgear and controlgear terms used for circuit-breakers are defined in IS 1885 (Part 17).'),
  rel('is-iec-60898-1', 'TERMINOLOGY', 'is-1885-17', 'Switchgear and controlgear terms used for circuit-breakers are defined in IS 1885 (Part 17).'),
  rel('is-732', 'RELATED_STANDARD', 'is-3043', 'Wiring installations are designed together with the earthing arrangements of IS 3043.'),
  rel('is-732', 'SAFETY', 'is-12640-1', 'Additional protection by residual current devices in wiring installations uses RCCBs as specified in IS 12640 (Part 1).'),
  rel('is-732', 'SAFETY', 'is-iec-60898-1', 'Overcurrent protection of final circuits typically uses MCBs as specified in IS/IEC 60898-1.'),

  // --- Cables
  rel('is-694', 'TEST_METHOD', 'is-10810-0', 'Cable tests are carried out under the IS 10810 series of methods of test for cables.'),
  rel('is-1554-1', 'TEST_METHOD', 'is-10810-0', 'Cable tests are carried out under the IS 10810 series of methods of test for cables.'),
  rel('is-7098-1', 'TEST_METHOD', 'is-10810-0', 'Cable tests are carried out under the IS 10810 series of methods of test for cables.'),
  rel('is-694', 'TERMINOLOGY', 'is-1885-32', 'Cable terms are defined in the electrotechnical vocabulary for electric cables.'),
  rel('is-1554-1', 'TERMINOLOGY', 'is-1885-32', 'Cable terms are defined in the electrotechnical vocabulary for electric cables.'),
  rel('is-7098-1', 'TERMINOLOGY', 'is-1885-32', 'Cable terms are defined in the electrotechnical vocabulary for electric cables.'),
  rel('is-694', 'INSTALLATION', 'is-732', 'Building wires are installed under the code of practice for electrical wiring installations.'),
  rel('is-7098-1', 'RELATED_PRODUCT', 'is-1554-1', 'PVC insulated heavy-duty cables are the alternative insulation system for the same voltage class.'),

  // --- Transformers
  rel('is-1180-1', 'NORMATIVE_REFERENCE', 'is-2026-1', 'Distribution transformers follow the general requirements for power transformers of IS 2026 (Part 1).'),
  rel('is-1180-1', 'RELATED_PRODUCT', 'is-335', 'Mineral-oil-immersed transformers are filled with insulating oil as specified in IS 335.'),
  rel('is-1180-1', 'TERMINOLOGY', 'is-1885-38', 'Transformer terms are defined in the electrotechnical vocabulary for power transformers and reactors.'),
  rel('is-1180-1', 'INSTALLATION', 'is-3043', 'Earthing of the transformer installation follows the code of practice for earthing.'),

  // --- Motors
  rel('is-12615', 'NORMATIVE_REFERENCE', 'is-iec-60034-1', 'General rating and performance requirements for rotating machines are in IS/IEC 60034-1.'),
  rel('is-12615', 'TEST_METHOD', 'is-15999-2-1', 'Motor efficiency for the IE class is determined by the loss and efficiency test methods of IS 15999 (Part 2/Sec 1).'),
  rel('is-12615', 'TERMINOLOGY', 'is-1885-35', 'Rotating machinery terms are defined in the electrotechnical vocabulary for rotating machinery.'),

  // --- Pumps
  rel('is-8034', 'RELATED_PRODUCT', 'is-9283', 'Motors for submersible pumpsets are specified in IS 9283.'),
  rel('is-8034', 'TEST_METHOD', 'is-11346', 'Acceptance tests for agricultural and water supply pumps are carried out as per IS 11346.'),
  rel('is-9079', 'TEST_METHOD', 'is-11346', 'Acceptance tests for agricultural and water supply pumps are carried out as per IS 11346.'),
  rel('is-14220', 'TEST_METHOD', 'is-11346', 'Acceptance tests for agricultural and water supply pumps are carried out as per IS 11346.'),
  rel('is-6595-1', 'TEST_METHOD', 'is-11346', 'Acceptance tests for agricultural and water supply pumps are carried out as per IS 11346.'),

  // --- Cement & concrete
  rel('is-269', 'TEST_METHOD', 'is-4031', 'The physical requirements of the cement are tested by the methods of the IS 4031 series.'),
  rel('is-269', 'TEST_METHOD', 'is-4032', 'The chemical requirements of the cement are tested by the methods of IS 4032.'),
  rel('is-269', 'RELATED_STANDARD', 'is-456', 'Cement used in structural concrete must also satisfy the material and durability provisions of IS 456.', { contextNote: 'Relevant when the cement is procured for concrete works.' }),
  rel('is-1489-1', 'TEST_METHOD', 'is-4031', 'The physical requirements of the cement are tested by the methods of the IS 4031 series.'),
  rel('is-1489-1', 'TEST_METHOD', 'is-4032', 'The chemical requirements of the cement are tested by the methods of IS 4032.'),
  rel('is-456', 'NORMATIVE_REFERENCE', 'is-269', 'IS 456 permits ordinary Portland cement conforming to IS 269 for concrete.'),
  rel('is-456', 'NORMATIVE_REFERENCE', 'is-1489-1', 'IS 456 permits Portland pozzolana cement conforming to IS 1489 (Part 1) for concrete.'),
  rel('is-456', 'NORMATIVE_REFERENCE', 'is-383', 'Aggregates for concrete are required to conform to IS 383.'),
  rel('is-456', 'NORMATIVE_REFERENCE', 'is-1786', 'Reinforcement bars for reinforced concrete are required to conform to IS 1786.'),

  // --- Steel
  rel('is-1786', 'TEST_METHOD', 'is-1608-1', 'Tensile properties of reinforcement bars are determined by the room-temperature tensile test of IS 1608 (Part 1).'),
  rel('is-1786', 'RELATED_STANDARD', 'is-456', 'Reinforcement is detailed and used in accordance with IS 456.', { contextNote: 'Relevant when bars are procured for reinforced concrete works.' }),
  rel('is-2062', 'TEST_METHOD', 'is-1608-1', 'Tensile properties of structural steel are determined by the room-temperature tensile test of IS 1608 (Part 1).'),

  // --- Solar PV
  rel('is-14286-1', 'TEST_METHOD', 'is-14286-2', 'Design qualification test procedures are specified in Part 2 of the same series.'),
  rel('is-14286-1', 'SAFETY', 'is-iec-61730-1', 'PV module safety qualification (construction requirements) is specified in IS/IEC 61730 (Part 1).'),
  rel('is-iec-61730-1', 'TEST_METHOD', 'is-iec-61730-2', 'Safety qualification tests are specified in IS/IEC 61730 (Part 2).'),
];
