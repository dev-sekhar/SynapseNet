// SynapseNet/chaincode/skill-manager/src/skillManagerContract.ts
import { Contract, Context, Info } from 'fabric-contract-api';
import stringify from 'json-stringify-deterministic';
import sortKeysRecursive from 'sort-keys-recursive';

// Define the Skill structure
interface Skill {
    skillId: string;
    skillName: string;
    description: string;
    creatorDid: string; // DID of the user who proposed the skill
    creationTimestamp: string;
    status: 'pending' | 'approved' | 'rejected'; // For governance/moderation later
    // In a real system, there might be a governance model for 'approved' status.
    // For MVP, skills created by any user are 'pending' and can be used.
}

@Info({ title: 'SkillManagerContract', description: 'SynapseNet Skill Management Contract' })
export class SkillManagerContract extends Contract {

    constructor() {
        super('SynapseNet.SkillManagerContract');
    }

    /**
     * Initialize the ledger (can be used for initial data or setup, optional for MVP)
     * @param {Context} ctx The transaction context
     */
    public async InitLedger(ctx: Context): Promise<void> {
        // For MVP, we might not need to pre-populate skills.
        // This function could be used later for seeding initial common skills by an admin.
        console.info('SynapseNet SkillManagerContract Initialized');
    }

    /**
     * Create a new skill in the ledger. Any user can propose a skill.
     * The status will initially be 'pending'.
     * @param {Context} ctx The transaction context
     * @param {string} skillName The name of the skill (e.g., "Python", "Cloud Computing")
     * @param {string} description A brief description of the skill
     * @param {string} creatorDid The Decentralized Identifier (DID) of the user proposing the skill
     * @returns {string} The ID of the newly created skill.
     */
    public async createSkill(ctx: Context, skillName: string, description: string, creatorDid: string): Promise<string> {
        const exists = await this.skillExists(ctx, skillName);
        if (exists) {
            throw new Error(`The skill with name ${skillName} already exists`);
        }

        // Generate a simple skillId for MVP. In a real system, you might use UUIDs or hashes.
        const skillId = ctx.stub.createCompositeKey('skill', [skillName.toLowerCase()]); // Use lowercase for consistency

        const skill: Skill = {
            skillId: skillId,
            skillName: skillName,
            description: description,
            creatorDid: creatorDid,
            creationTimestamp: ctx.stub.getTxTimestamp().seconds.toString(),
            status: 'pending' // Initial status
        };

        // Put the skill on the ledger
        // Use sortKeysRecursive and stringify-deterministic for consistent JSON representation
        // This is CRITICAL for deterministic transactions in Fabric.
        await ctx.stub.putState(skillId, Buffer.from(stringify(sortKeysRecursive(skill))));

        // Emit an event to notify listeners of new skill creation
        ctx.stub.setEvent('CreateSkill', Buffer.from(stringify(sortKeysRecursive({ skillId, skillName, creatorDid }))));

        return skillId;
    }

    /**
     * Retrieves a skill by its skillId.
     * @param {Context} ctx The transaction context
     * @param {string} skillId The ID of the skill to retrieve
     * @returns {string} The JSON string representation of the skill.
     */
    public async getSkill(ctx: Context, skillId: string): Promise<string> {
        const skillJSON = await ctx.stub.getState(skillId); // get the skill from chaincode state
        if (!skillJSON || skillJSON.length === 0) {
            throw new Error(`The skill ${skillId} does not exist`);
        }
        return skillJSON.toString();
    }

    /**
     * Checks if a skill with the given name already exists (using a composite key based on name).
     * This is a helper function and not a public transaction function.
     * @param {Context} ctx The transaction context
     * @param {string} skillName The name of the skill
     * @returns {boolean} True if the skill exists, false otherwise.
     */
    private async skillExists(ctx: Context, skillName: string): Promise<boolean> {
        const skillId = ctx.stub.createCompositeKey('skill', [skillName.toLowerCase()]);
        const skillJSON = await ctx.stub.getState(skillId);
        return skillJSON && skillJSON.length > 0;
    }

    /**
     * Retrieves all skills from the ledger. (Caution: for large ledgers, this may be inefficient.)
     * @param {Context} ctx The transaction context
     * @returns {string} An array of JSON strings representing all skills.
     */
    public async getAllSkills(ctx: Context): Promise<string> {
        const allResults = [];
        const iterator = await ctx.stub.getStateByPartialCompositeKey('skill', []);
        let result = await iterator.next();
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }
            allResults.push(record);
            result = await iterator.next();
        }
        return JSON.stringify(allResults);
    }

    /**
     * Searches for skills by a keyword in their name or description (basic implementation for MVP).
     * (Note: More advanced search might involve off-chain indexing services).
     * @param {Context} ctx The transaction context
     * @param {string} keyword The keyword to search for.
     * @returns {string} An array of JSON strings representing matching skills.
     */
    public async searchSkills(ctx: Context, keyword: string): Promise<string> {
        const lowerCaseKeyword = keyword.toLowerCase();
        const allSkills = JSON.parse(await this.getAllSkills(ctx)) as Skill[];
        const matchingSkills = allSkills.filter(skill =>
            skill.skillName.toLowerCase().includes(lowerCaseKeyword) ||
            skill.description.toLowerCase().includes(lowerCaseKeyword)
        );
        return JSON.stringify(matchingSkills);
    }
}