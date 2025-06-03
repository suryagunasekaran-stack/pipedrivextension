import mongoose from 'mongoose';

const companyConfigSchema = new mongoose.Schema({
    companyId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    config: {
        pipedrive: {
            clientId: String,
            clientSecret: String,
            redirectUri: String,
            apiDomain: String
        },
        xero: {
            clientId: String,
            clientSecret: String,
            redirectUri: String
        },
        frontend: {
            baseUrl: String
        },
        customFields: {
            department: String,
            vesselName: String,
            salesInCharge: String,
            location: String,
            quoteNumber: String
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
companyConfigSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

export const CompanyConfig = mongoose.model('CompanyConfig', companyConfigSchema); 