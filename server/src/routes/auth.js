import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'

export const authRouter = Router()

function handleMe(req, res) {
  const profile = {
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    roles: req.user.roles,
    runnerStatus: req.user.runnerStatus,
    defaultLocationId: req.user.defaultLocationId,
  }
  if (req.user.phone) {
    profile.phone = req.user.phone
  }
  res.status(200).json(profile)
}

// REST route
authRouter.get('/api/v1/auth/me', authenticate, handleMe)

// RPC route (for frontend api.js request('auth.me'))
authRouter.post('/auth/me', authenticate, handleMe)
